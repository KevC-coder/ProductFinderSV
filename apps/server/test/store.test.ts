import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/db/store.js';
import type { Evaluation } from '../src/matcher/evaluate.js';
import { makeListing, watcherInput } from './helpers.js';

const ev = (score = 70): Evaluation => ({
  verdict: 'match',
  score,
  matchedKeywords: ['13'],
  isIdealPrice: false,
  descriptionPending: false,
  reason: null,
});

test('watchers: crear, leer, actualizar parcial y borrar', () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput({ mustKeywords: ['13', 'liberado'], conditions: ['used_good'] }));
  assert.equal(w.id, 1);
  assert.deepEqual(w.mustKeywords, ['13', 'liberado']);
  assert.deepEqual(w.conditions, ['used_good']);
  assert.equal(w.active, true);

  const u = s.watchers.update(w.id, { active: false, maxPrice: 350 });
  assert.equal(u?.active, false);
  assert.equal(u?.maxPrice, 350);
  assert.equal(u?.query, 'iphone 13');

  assert.equal(s.watchers.delete(w.id), true);
  assert.equal(s.watchers.get(w.id), null);
});

test('listings: no borra la descripción y detecta bajadas de precio', () => {
  const s = createStore(':memory:');
  const first = s.listings.upsert(makeListing({ id: '1', price: 300, description: 'Batería 90%' }), {
    detailFetched: true,
    now: '2026-10-08T10:00:00Z',
  });
  assert.deepEqual(first, { isNew: true, priceDropped: false, previousPrice: null });

  const again = s.listings.upsert(makeListing({ id: '1', price: 300 }), { now: '2026-10-08T11:00:00Z' });
  assert.equal(again.isNew, false);
  assert.equal(again.priceDropped, false);
  assert.equal(s.listings.get('1')?.description, 'Batería 90%');

  const drop = s.listings.upsert(makeListing({ id: '1', price: 250 }), { now: '2026-10-08T12:00:00Z' });
  assert.deepEqual(drop, { isNew: false, priceDropped: true, previousPrice: 300 });
  const stored = s.listings.get('1')!;
  assert.equal(stored.price, 250);
  assert.equal(stored.previousPrice, 300);
  assert.equal(stored.priceDroppedAt, '2026-10-08T12:00:00Z');
  assert.equal(stored.detailFetchedAt, '2026-10-08T10:00:00Z');
  assert.deepEqual(s.listings.priceHistory('1').map((p) => p.price), [300, 250]);
});

test('matches: upsert, filtros, estados y descartados', () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput());
  s.listings.upsert(makeListing({ id: '1', price: 300 }));
  s.listings.upsert(makeListing({ id: '2', price: 200 }));
  const a = s.matches.upsert(w.id, '1', ev(60));
  const b = s.matches.upsert(w.id, '2', ev(80));
  assert.equal(a.isNew, true);
  assert.equal(s.matches.upsert(w.id, '1', ev(65)).isNew, false);

  assert.deepEqual(s.matches.list().items.map((m) => m.listing.id), ['2', '1']);
  assert.deepEqual(s.matches.list({ sort: 'price' }).items.map((m) => m.listing.id), ['2', '1']);
  assert.deepEqual(s.matches.list({ maxPrice: 250 }).items.map((m) => m.listing.id), ['2']);
  assert.equal(s.matches.get(a.id)?.score, 65);

  s.matches.setStatus(b.id, 'dismissed');
  assert.deepEqual(s.matches.list().items.map((m) => m.listing.id), ['1']);
  assert.equal(s.matches.list({ status: ['dismissed'] }).total, 1);
  assert.deepEqual(s.matches.countByStatus(w.id), { new: 1, seen: 0, favorite: 0, dismissed: 1 });
});

test('matches: detecta republicaciones del mismo vendedor', () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput());
  s.listings.upsert(makeListing({ id: '1', title: 'IPhone 13 Liberado de fábrica', sellerName: 'Ana', price: 315 }));
  s.matches.upsert(w.id, '1', ev());
  const repost = makeListing({ id: '2', title: 'iPhone 13 liberado de fabrica', sellerName: 'Ana', price: 315 });
  s.listings.upsert(repost);
  assert.equal(s.matches.findDuplicate(w.id, repost), '1');
  assert.equal(s.matches.findDuplicate(w.id, { ...repost, sellerName: 'Otro' }), null);
  assert.equal(s.matches.findDuplicate(w.id, { ...repost, price: 300 }), null);
});

test('borrar un watcher borra sus matches y corridas', () => {
  const s = createStore(':memory:');
  const w = s.watchers.create(watcherInput());
  s.listings.upsert(makeListing({ id: '1' }));
  s.matches.upsert(w.id, '1', ev());
  s.runs.finish(s.runs.start(w.id), { status: 'ok' });
  s.watchers.delete(w.id);
  assert.equal(s.matches.list().total, 0);
  assert.equal(s.runs.list().length, 0);
});

test('settings: valores por defecto y claves desconocidas ignoradas', () => {
  const s = createStore(':memory:');
  assert.equal(s.settings.get('browserMode'), 'offscreen');
  s.settings.set({ browserMode: 'visible', maxRunsPerHour: 6 });
  s.settings.set({ nope: 1 } as never);
  assert.equal(s.settings.get('browserMode'), 'visible');
  assert.equal(s.settings.get('maxRunsPerHour'), 6);
  assert.equal('nope' in s.settings.all(), false);
});

test('settings: migra el antiguo "headless" a browserMode', () => {
  const s = createStore(':memory:');
  s.db.prepare("INSERT INTO settings (key, value) VALUES ('headless', 'true')").run();
  assert.equal(s.settings.get('browserMode'), 'headless');
  assert.equal('headless' in s.settings.all(), false);

  const s2 = createStore(':memory:');
  s2.db.prepare("INSERT INTO settings (key, value) VALUES ('headless', 'false')").run();
  assert.equal(s2.settings.get('browserMode'), 'offscreen');
});
