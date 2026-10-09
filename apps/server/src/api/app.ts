import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { MatchFilter } from '../db/matches.js';
import type { Settings } from '../db/settings.js';
import type { Store } from '../db/store.js';
import type { MatchStatus, WatcherInput } from '../domain/types.js';
import type { Bot } from '../scheduler/bot.js';
import { APP_VERSION, VERSION_HEADER } from '../version.js';
import { registerErrorHandler } from './errors.js';
import { registerEvents } from './events.js';
import {
  createWatcherBody,
  idParams,
  matchesQuery,
  patchMatchBody,
  patchSettingsBody,
  patchWatcherBody,
  runsQuery,
} from './schemas.js';

export interface AppDeps {
  store: Store;
  bot: Bot;
  logger?: FastifyServerOptions['logger'];
  /** Cierra el servicio (botón "Cerrar ProductFinderSV" del panel). Sin él, la ruta no existe. */
  onShutdown?: () => Promise<void>;
  /** Carpeta con el panel compilado (apps/web/dist). Sin ella solo se sirve la API. */
  webDir?: string;
}

/** Sirve el panel y devuelve index.html para cualquier ruta que no sea de la API. */
function registerWeb(app: FastifyInstance, webDir: string): void {
  void app.register(fastifyStatic, { root: webDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Ruta no encontrada' });
    return reply.sendFile('index.html');
  });
}

type IdParams = { Params: { id: number } };

function invalidPriceRange(w: Partial<WatcherInput>): string | null {
  if (w.minPrice != null && w.maxPrice != null && w.minPrice > w.maxPrice) {
    return 'El precio mínimo no puede ser mayor que el máximo';
  }
  return null;
}

export function buildApp({ store, bot, logger = false, webDir, onShutdown }: AppDeps): FastifyInstance {
  // removeAdditional: false → los campos desconocidos dan 400 en vez de ignorarse en silencio.
  // forceCloseConnections: al cerrar se cortan también las conexiones abiertas (como la de
  // eventos en vivo del panel); si no, el cierre esperaría para siempre.
  const app = Fastify({ logger, forceCloseConnections: true, ajv: { customOptions: { removeAdditional: false } } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header(VERSION_HEADER, APP_VERSION);
  });

  registerErrorHandler(app);
  registerEvents(app, bot);
  if (webDir) registerWeb(app, webDir);

  // ---- Estado, sesión y bot -----------------------------------------------------------

  app.get('/api/status', async () => ({
    version: APP_VERSION,
    canShutdown: !!onShutdown,
    ...bot.status(),
    activeWatchers: store.watchers.countActive(),
    matches: store.matches.countByStatus(),
  }));

  app.post('/api/session/connect', async (_req, reply) => {
    const pending = bot.login();
    if (!pending) return reply.code(409).send({ error: 'Ya hay una ventana de login abierta' });
    pending.catch((err) => app.log.error(err, 'login falló'));
    return reply.code(202).send({ queued: true });
  });

  if (onShutdown) {
    /** Detiene el servicio (y con él las búsquedas automáticas). Acepta cualquier cuerpo o ninguno. */
    app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser('*', (_req, _payload, done) => done(null));
      scope.post('/api/system/shutdown', async (_req, reply) => {
        setTimeout(() => void onShutdown(), 300);
        return reply.code(202).send({ stopping: true });
      });
    });
  }

  /** Quita la pausa automática por checkpoint. */
  app.post('/api/scheduler/resume', async () => {
    bot.resume();
    return bot.status();
  });

  // ---- Búsquedas (watchers) -----------------------------------------------------------

  app.get('/api/watchers', async () =>
    store.watchers.list().map((w) => ({
      ...w,
      lastRun: store.runs.lastFinished(w.id),
      matches: store.matches.countByStatus(w.id),
      queued: bot.isQueued(w.id),
    })),
  );

  app.post<{ Body: WatcherInput }>('/api/watchers', { schema: { body: createWatcherBody } }, async (req, reply) => {
    const error = invalidPriceRange(req.body);
    if (error) return reply.code(400).send({ error });
    const created = store.watchers.create(req.body);
    bot.onWatcherSaved(created);
    return reply.code(201).send(store.watchers.get(created.id));
  });

  app.get<IdParams>('/api/watchers/:id', { schema: { params: idParams } }, async (req, reply) => {
    const w = store.watchers.get(req.params.id);
    return w ?? reply.code(404).send({ error: 'Búsqueda no encontrada' });
  });

  app.patch<IdParams & { Body: Partial<WatcherInput> }>(
    '/api/watchers/:id',
    { schema: { params: idParams, body: patchWatcherBody } },
    async (req, reply) => {
      const current = store.watchers.get(req.params.id);
      if (!current) return reply.code(404).send({ error: 'Búsqueda no encontrada' });
      const error = invalidPriceRange({ ...current, ...req.body });
      if (error) return reply.code(400).send({ error });
      const updated = store.watchers.update(req.params.id, req.body)!;
      bot.onWatcherSaved(updated, req.body);
      // Releer: onWatcherSaved puede haber cambiado la próxima corrida.
      return store.watchers.get(updated.id);
    },
  );

  app.delete<IdParams>('/api/watchers/:id', { schema: { params: idParams } }, async (req, reply) => {
    if (!store.watchers.delete(req.params.id)) return reply.code(404).send({ error: 'Búsqueda no encontrada' });
    return reply.code(204).send();
  });

  /** Ejecuta la búsqueda ya. Con ?wait=true espera y devuelve el resumen (para "Probar ahora"). */
  app.post<IdParams & { Querystring: { wait?: boolean } }>(
    '/api/watchers/:id/run',
    {
      schema: {
        params: idParams,
        querystring: { type: 'object', properties: { wait: { type: 'boolean', default: false } } },
      },
    },
    async (req, reply) => {
      if (!store.watchers.get(req.params.id)) return reply.code(404).send({ error: 'Búsqueda no encontrada' });
      const pending = bot.runNow(req.params.id);
      if (!pending) return reply.code(409).send({ error: 'La búsqueda ya está en cola' });
      if (req.query.wait) return pending;
      pending.catch((err) => app.log.error(err, 'corrida falló'));
      return reply.code(202).send({ queued: true });
    },
  );

  // ---- Resultados ---------------------------------------------------------------------

  app.get<{ Querystring: MatchFilter }>('/api/matches', { schema: { querystring: matchesQuery } }, async (req) => store.matches.list(req.query));

  app.patch<IdParams & { Body: { status: MatchStatus } }>(
    '/api/matches/:id',
    { schema: { params: idParams, body: patchMatchBody } },
    async (req, reply) => {
      const m = store.matches.setStatus(req.params.id, req.body.status);
      return m ?? reply.code(404).send({ error: 'Resultado no encontrado' });
    },
  );

  app.get<{ Params: { id: string } }>('/api/listings/:id/price-history', async (req, reply) => {
    if (!store.listings.get(req.params.id)) return reply.code(404).send({ error: 'Publicación no encontrada' });
    return store.listings.priceHistory(req.params.id);
  });

  // ---- Actividad y ajustes ------------------------------------------------------------

  app.get<{ Querystring: { watcherId?: number; limit?: number } }>(
    '/api/runs',
    { schema: { querystring: runsQuery } },
    async (req) => store.runs.list(req.query),
  );

  app.get('/api/settings', async () => store.settings.all());

  app.patch<{ Body: Partial<Settings> }>(
    '/api/settings',
    { schema: { body: patchSettingsBody } },
    async (req, reply) => {
      const merged = { ...store.settings.all(), ...req.body };
      if (merged.maxBackoffMinutes < merged.errorBackoffMinutes) {
        return reply.code(400).send({ error: 'La espera máxima tras errores debe ser mayor que la inicial' });
      }
      return store.settings.set(req.body);
    },
  );

  return app;
}
