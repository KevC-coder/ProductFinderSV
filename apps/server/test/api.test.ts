import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/api/app.js';
import { createStore } from '../src/db/store.js';
import { Bot } from '../src/scheduler/bot.js';
import { fakeScraper, makeListing } from './helpers.js';

function setup() {
  const store = createStore(':memory:');
  const { scraper } = fakeScraper({
    listings: [
      makeListing({ id: '1', title: 'iPhone 13 liberado', price: 260 }),
      makeListing({ id: '2', title: 'iPhone 13 para repuesto', price: 115 }),
    ],
  });
  const bot = new Bot(store, scraper);
  return { store, bot, app: buildApp({ store, bot }) };
}

test('crear búsqueda aplica valores por defecto', async () => {
  const { app } = setup();
  const res = await app.inject({ method: 'POST', url: '/api/watchers', payload: { name: 'iPhone', query: 'iphone 13' } });
  assert.equal(res.statusCode, 201);
  const w = res.json();
  assert.equal(w.runsPerDay, 6);
  assert.equal(w.mustMode, 'all');
  assert.equal(w.searchDescription, true);
  assert.deepEqual(w.excludeKeywords, []);
});

test('validación de entrada', async () => {
  const { app } = setup();
  const bad = async (payload: object) =>
    (await app.inject({ method: 'POST', url: '/api/watchers', payload })).statusCode;
  assert.equal(await bad({ name: 'x' }), 400);
  assert.equal(await bad({ name: 'x', query: 'y', windowStart: '25:00' }), 400);
  assert.equal(await bad({ name: 'x', query: 'y', mustMode: 'some' }), 400);
  assert.equal(await bad({ name: 'x', query: 'y', minPrice: 500, maxPrice: 100 }), 400);
  assert.equal(await bad({ name: 'x', query: 'y', runsPerDay: 100 }), 400);
  assert.equal(await bad({ name: 'x', query: 'y', campoRaro: 1 }), 400);
});

test('los errores de validación se explican en español', async () => {
  const { app } = setup();
  const w = (await app.inject({ method: 'POST', url: '/api/watchers', payload: { name: 'a', query: 'b' } })).json();
  const patch = async (payload: object) =>
    (await app.inject({ method: 'PATCH', url: `/api/watchers/${w.id}`, payload })).json().error;

  // Caso real: el panel reenviaba datos de presentación junto con la búsqueda.
  assert.equal(await patch({ excludeKeywords: ['golpe'], lastRun: null }), 'Campo no permitido: “lastRun”.');
  assert.equal(await patch({ maxPrice: -5 }), 'Precio máximo: debe ser como mínimo 0.');
  assert.equal(await patch({ excludeKeywords: [''] }), 'Keywords excluidas: no puede estar vacío.');
  assert.equal(await patch({ windowStart: '7am' }), 'Hora de inicio: formato no válido.');
  const missing = await app.inject({ method: 'POST', url: '/api/watchers', payload: { name: 'x' } });
  assert.equal(missing.json().error, 'Falta el campo “Texto de búsqueda”.');
});

test('PATCH parcial no rellena valores por defecto', async () => {
  const { app } = setup();
  const created = (
    await app.inject({ method: 'POST', url: '/api/watchers', payload: { name: 'a', query: 'b', runsPerDay: 3 } })
  ).json();
  const res = await app.inject({ method: 'PATCH', url: `/api/watchers/${created.id}`, payload: { active: false } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().active, false);
  assert.equal(res.json().runsPerDay, 3);
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/watchers/999', payload: { active: false } })).statusCode, 404);
});

test('ejecutar ahora, listar resultados y cambiar estado', async () => {
  const { app } = setup();
  const w = (
    await app.inject({
      method: 'POST',
      url: '/api/watchers',
      payload: { name: 'iPhone', query: 'iphone 13', excludeKeywords: ['repuesto'], searchDescription: false },
    })
  ).json();

  const run = await app.inject({ method: 'POST', url: `/api/watchers/${w.id}/run?wait=true` });
  assert.equal(run.statusCode, 200);
  assert.equal(run.json().status, 'ok');
  assert.equal(run.json().newMatchIds.length, 1);

  const list = (await app.inject({ method: 'GET', url: `/api/matches?watcherId=${w.id}` })).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].listing.title, 'iPhone 13 liberado');

  const matchId = list.items[0].id;
  const patched = await app.inject({ method: 'PATCH', url: `/api/matches/${matchId}`, payload: { status: 'favorite' } });
  assert.equal(patched.json().status, 'favorite');
  const favs = (await app.inject({ method: 'GET', url: '/api/matches?status=favorite' })).json();
  assert.equal(favs.total, 1);

  const history = (await app.inject({ method: 'GET', url: '/api/listings/1/price-history' })).json();
  assert.equal(history[0].price, 260);

  const watchers = (await app.inject({ method: 'GET', url: '/api/watchers' })).json();
  assert.equal(watchers[0].lastRun.status, 'ok');
  assert.equal(watchers[0].matches.favorite, 1);

  const runs = (await app.inject({ method: 'GET', url: '/api/runs' })).json();
  assert.equal(runs.length, 1);
});

test('sirve el panel y devuelve index.html para rutas que no son de la API', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfsv-web-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>panel</title>');
  const store = createStore(':memory:');
  const bot = new Bot(store, fakeScraper({ listings: [] }).scraper);
  const app = buildApp({ store, bot, webDir: dir });

  const page = await app.inject({ method: 'GET', url: '/resultados' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /panel/);
  const api404 = await app.inject({ method: 'GET', url: '/api/no-existe' });
  assert.equal(api404.statusCode, 404);
  assert.equal(api404.json().error, 'Ruta no encontrada');
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('identifica el servicio y permite cerrarlo solo si hay onShutdown', async () => {
  const { app } = setup();
  const res = await app.inject({ method: 'GET', url: '/api/status' });
  assert.equal(res.headers['x-productfindersv'], 'dev');
  assert.equal(res.json().canShutdown, false);
  assert.equal((await app.inject({ method: 'POST', url: '/api/system/shutdown' })).statusCode, 404);

  let closed = false;
  const store = createStore(':memory:');
  const bot = new Bot(store, fakeScraper({ listings: [] }).scraper);
  const app2 = buildApp({ store, bot, onShutdown: async () => void (closed = true) });
  assert.equal((await app2.inject({ method: 'GET', url: '/api/status' })).json().canShutdown, true);
  // Debe aceptar la petición venga con el tipo de contenido que venga (p. ej. desde PowerShell).
  const res2 = await app2.inject({
    method: 'POST',
    url: '/api/system/shutdown',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: '',
  });
  assert.equal(res2.statusCode, 202);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(closed, true);
});

test('el servidor se cierra aunque el panel tenga abierta la conexión de eventos en vivo', async () => {
  const { app } = setup();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as { port: number };
  const sse = await fetch(`http://127.0.0.1:${port}/api/events`);
  assert.equal(sse.status, 200);

  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
  ]);
  assert.equal(closed, true);
  await sse.body?.cancel().catch(() => {});
});

test('crear búsqueda la programa; desactivarla quita el horario', async () => {
  const { app } = setup();
  const w = (await app.inject({ method: 'POST', url: '/api/watchers', payload: { name: 'a', query: 'b' } })).json();
  assert.ok(w.nextRunAt);
  const off = await app.inject({ method: 'PATCH', url: `/api/watchers/${w.id}`, payload: { active: false } });
  assert.equal(off.json().nextRunAt, null);
});

test('status, ajustes del bot y reanudar', async () => {
  const { app, store } = setup();
  const status = (await app.inject({ method: 'GET', url: '/api/status' })).json();
  assert.equal(status.sessionState, 'unknown');
  assert.equal(status.schedulerEnabled, true);
  assert.equal(status.searchingWatcherId, null);
  assert.equal(status.loggingIn, false);
  assert.equal(status.activeWatchers, 0);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { browserMode: 'headless', schedulerEnabled: false, maxRunsPerHour: 6, jitterPercent: 30 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().browserMode, 'headless');
  assert.equal((await app.inject({ method: 'GET', url: '/api/status' })).json().blockedReason, 'disabled');

  const patch = async (payload: object) =>
    (await app.inject({ method: 'PATCH', url: '/api/settings', payload })).statusCode;
  assert.equal(await patch({ browserMode: 'invisible' }), 400);
  // Estado interno: no editable desde la API.
  assert.equal(await patch({ sessionState: 'connected' }), 400);
  assert.equal(await patch({ pausedUntil: null }), 400);
  // Valores fuera de rango.
  assert.equal(await patch({ minIntervalMinutes: 5 }), 400);
  assert.equal(await patch({ jitterPercent: 90 }), 400);
  assert.equal(await patch({ errorBackoffMinutes: 60, maxBackoffMinutes: 30 }), 400);

  store.settings.set({ pausedUntil: '2999-01-01T00:00:00.000Z' });
  const resumed = (await app.inject({ method: 'POST', url: '/api/scheduler/resume' })).json();
  assert.equal(resumed.pausedUntil, null);
});
