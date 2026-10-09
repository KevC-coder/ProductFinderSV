import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './api/app.js';
import { paths } from './config.js';
import { createStore } from './db/store.js';
import { Bot } from './scheduler/bot.js';
import { createPlaywrightScraper } from './scraper/scraper.js';
import { APP_VERSION } from './version.js';

export interface StartOptions {
  port?: number;
  /** Carpeta del panel compilado; si no existe solo se sirve la API. */
  webDir?: string;
  /** Archivo de log. Sin él, los logs van a la consola (modo desarrollo). */
  logFile?: string;
}

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Arranca todo el servicio: base de datos, bot programado y API + panel en 127.0.0.1.
 * Lo usan tanto `npm run start` (main.ts) como el ejecutable de escritorio.
 */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? 8787;
  const store = createStore(path.join(paths.data, 'productfindersv.db'));
  store.runs.failStale();

  if (opts.logFile) fs.mkdirSync(path.dirname(opts.logFile), { recursive: true });
  const scraper = createPlaywrightScraper({ mode: () => store.settings.get('browserMode') });
  const bot = new Bot(store, scraper);

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= (async () => {
      bot.stop();
      await app.close();
      store.db.close();
    })());

  const app = buildApp({
    store,
    bot,
    logger: opts.logFile ? { level: 'info', file: opts.logFile } : true,
    webDir: opts.webDir && fs.existsSync(opts.webDir) ? opts.webDir : undefined,
    onShutdown: async () => {
      // Red de seguridad: si algo bloquea el cierre ordenado, salir igual.
      setTimeout(() => process.exit(0), 5000).unref();
      await stop().catch((err) => app.log.error(err, 'error al cerrar'));
      process.exit(0);
    },
  });

  bot.on('run:finished', (s) =>
    app.log.info(
      { watcherId: s.watcherId, status: s.status, found: s.foundCount, new: s.newMatchIds.length, error: s.errorMessage },
      'corrida terminada',
    ),
  );

  // Solo 127.0.0.1: el panel no debe ser accesible desde otros equipos de la red.
  await app.listen({ host: '127.0.0.1', port });
  bot.start();
  app.log.info({ version: APP_VERSION, data: paths.data }, 'ProductFinderSV iniciado');
  return { url: `http://127.0.0.1:${port}`, stop };
}
