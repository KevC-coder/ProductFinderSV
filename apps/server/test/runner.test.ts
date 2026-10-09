import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/db/store.js';
import { BrowserQueue } from '../src/runner/browser-queue.js';
import { runWatcher, toSearchParams } from '../src/runner/run-watcher.js';
import { fakeScraper, makeListing, watcherInput } from './helpers.js';

test('toSearchParams convierte horas al filtro de días de Facebook', () => {
  const s = createStore(':memory:');
  const mk = (maxAgeHours: number | null) => s.watchers.create(watcherInput({ maxAgeHours }));
  assert.equal(toSearchParams(mk(null)).daysSinceListed, undefined);
  assert.equal(toSearchParams(mk(12)).daysSinceListed, 1);
  assert.equal(toSearchParams(mk(48)).daysSinceListed, 7);
  assert.equal(toSearchParams(mk(500)).daysSinceListed, 30);
});

test('corrida completa: filtra, abre detalle de dudosos, guarda matches y registra la corrida', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(
    watcherInput({
      mustKeywords: ['liberado'],
      excludeKeywords: ['repuesto'],
      searchDescription: true,
      maxPrice: 400,
      idealPrice: 280,
      maxDetails: 5,
    }),
  );
  const { scraper, detailCalls } = fakeScraper({
    listings: [
      makeListing({ id: '1', title: 'iPhone 13 liberado', price: 260 }), // match por título → detalle por exclusiones
      makeListing({ id: '2', title: 'iPhone 13', price: 300 }), // necesita descripción
      makeListing({ id: '3', title: 'Iphone+para+repuesto', price: 115 }), // excluido
      makeListing({ id: '4', title: 'iPhone 13 liberado', price: 500 }), // fuera de precio
      makeListing({ id: '5', title: 'iPhone 13', price: 290 }), // detalle sin "liberado"
    ],
    details: {
      '1': { description: 'Batería 90%' },
      '2': { description: 'Liberado de fábrica, batería 86%' },
      '5': { description: 'Solo funciona con Claro' },
    },
  });

  const r = await runWatcher(s, scraper, w);
  assert.equal(r.status, 'ok');
  assert.equal(r.foundCount, 5);
  assert.deepEqual(detailCalls.sort(), ['1', '2', '5']);
  assert.equal(r.detailsFetched, 3);
  assert.equal(r.newMatchIds.length, 2);

  const matches = s.matches.list({ watcherId: w.id }).items;
  assert.deepEqual(matches.map((m) => m.listing.id).sort(), ['1', '2']);
  assert.equal(matches.find((m) => m.listing.id === '1')?.isIdealPrice, true);
  assert.equal(s.listings.get('2')?.description, 'Liberado de fábrica, batería 86%');
  // El rechazado tras abrir el detalle queda en caché para no volver a abrirlo.
  assert.ok(s.listings.get('5')?.detailFetchedAt);

  const [run] = s.runs.list();
  assert.equal(run?.status, 'ok');
  assert.equal(run?.newCount, 2);
  assert.equal(s.settings.get('sessionState'), 'connected');
});

test('segunda corrida: reutiliza detalles guardados, no repite matches y detecta bajadas de precio', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput({ mustKeywords: ['liberado'], searchDescription: true }));
  let price = 300;
  const { scraper, detailCalls } = fakeScraper({
    listings: () => [makeListing({ id: '1', title: 'iPhone 13', price })],
    details: { '1': { description: 'Liberado' } },
  });

  const first = await runWatcher(s, scraper, w);
  assert.equal(first.newMatchIds.length, 1);
  price = 270;
  const second = await runWatcher(s, scraper, w);
  assert.deepEqual(detailCalls, ['1']);
  assert.equal(second.newMatchIds.length, 0);
  assert.deepEqual(second.priceDropMatchIds, first.newMatchIds);
  assert.equal(s.listings.get('1')?.previousPrice, 300);
});

test('lo que cumple por título se muestra ya; si luego la descripción lo excluye, se quita', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(
    watcherInput({ mustKeywords: ['13'], excludeKeywords: ['golpe'], searchDescription: true, maxDetails: 0 }),
  );
  const { scraper } = fakeScraper({
    listings: [makeListing({ id: '1', title: 'iPhone 13' }), makeListing({ id: '2', title: 'iPhone 13 Pro' })],
    details: { '1': { description: 'Pantalla con golpe' }, '2': { description: 'Impecable' } },
  });

  // Sin presupuesto de detalles: se muestran ambos (pendientes de revisar la descripción).
  const first = await runWatcher(s, scraper, w);
  assert.equal(first.newMatchIds.length, 2);
  assert.equal(first.detailsFetched, 0);

  // El usuario marcó el 2 como favorito; el 1 sigue sin revisar.
  const fav = s.matches.list().items.find((m) => m.listing.id === '2')!;
  s.matches.setStatus(fav.id, 'favorite');

  const w2 = s.watchers.update(w.id, { maxDetails: 5 })!;
  const second = await runWatcher(s, scraper, w2);
  assert.equal(second.detailsFetched, 2);
  assert.deepEqual(s.matches.list().items.map((m) => m.listing.id), ['2']);
  assert.ok(s.listings.get('1')?.detailFetchedAt);
});

test('al agregar una exclusión, se quitan resultados ya guardados aunque no se reabra el detalle', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput({ searchDescription: true }));
  const { scraper, detailCalls } = fakeScraper({
    listings: [makeListing({ id: '1', title: 'iPhone 13 Pro' })],
    details: { '1': { description: 'Cámara dañada por un golpe' } },
  });
  // Sin exclusiones no hace falta abrir el detalle.
  await runWatcher(s, scraper, s.watchers.update(w.id, { excludeKeywords: ['repuesto'] })!);
  assert.equal(s.matches.list().total, 1);
  assert.deepEqual(detailCalls, ['1']);

  await runWatcher(s, scraper, s.watchers.update(w.id, { excludeKeywords: ['repuesto', 'golpe'] })!);
  assert.deepEqual(detailCalls, ['1']);
  assert.equal(s.matches.list().total, 0);
});

test('respeta el tope de detalles por corrida, priorizando mejor puntuación', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(
    watcherInput({ mustKeywords: ['liberado'], searchDescription: true, maxDetails: 1, idealPrice: 250 }),
  );
  const { scraper, detailCalls } = fakeScraper({
    listings: [makeListing({ id: '1', title: 'iPhone', price: 350 }), makeListing({ id: '2', title: 'iPhone', price: 200 })],
  });
  await runWatcher(s, scraper, w);
  assert.deepEqual(detailCalls, ['2']);
});

test('republicación: se guarda como duplicado y no cuenta como nuevo', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput());
  const { scraper } = fakeScraper({
    listings: [
      makeListing({ id: '1', title: 'IPhone 13 Liberado de fábrica', sellerName: 'Ana', price: 315 }),
      makeListing({ id: '2', title: 'iPhone 13 Liberado de fábrica', sellerName: 'Ana', price: 315 }),
    ],
  });
  const r = await runWatcher(s, scraper, w);
  assert.equal(r.newMatchIds.length, 1);
  assert.equal(s.matches.list().total, 1);
  assert.equal(s.matches.list({ includeDuplicates: true }).total, 2);
});

test('checkpoint y errores quedan registrados sin lanzar', async () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput());

  const blocked = await runWatcher(s, fakeScraper({ listings: [], sessionState: 'checkpoint' }).scraper, w);
  assert.equal(blocked.status, 'checkpoint');
  assert.equal(s.settings.get('sessionState'), 'checkpoint');

  const failed = await runWatcher(s, fakeScraper({ listings: [], throwOnSearch: new Error('timeout') }).scraper, w);
  assert.equal(failed.status, 'error');
  assert.equal(failed.errorMessage, 'timeout');
  assert.deepEqual(s.runs.list().map((r) => r.status), ['error', 'checkpoint']);
});

test('BrowserQueue ejecuta en serie y sigue tras un error', async () => {
  const q = new BrowserQueue();
  const order: string[] = [];
  const job = (name: string, ms: number, fail = false) =>
    q.run(name, async () => {
      order.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`end ${name}`);
      if (fail) throw new Error(name);
      return name;
    });
  const a = job('a', 20, true);
  const b = job('b', 1);
  assert.equal(q.has('b'), true);
  await assert.rejects(a);
  assert.equal(await b, 'b');
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b']);
  assert.equal(q.has('b'), false);
});
