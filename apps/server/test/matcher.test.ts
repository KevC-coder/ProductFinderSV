import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeScore, evaluateListing } from '../src/matcher/evaluate.js';
import { containsKeyword, normalizeText } from '../src/matcher/normalize.js';
import { makeListing, watcherInput } from './helpers.js';

test('normalizeText: acentos, "+", y números pegados a letras', () => {
  assert.equal(normalizeText('Iphone+para+repuesto'), 'iphone para repuesto');
  assert.equal(normalizeText('iPhone13 128GB Batería'), 'iphone 13 128 gb bateria');
  assert.equal(normalizeText('🚨IPHONE 13 | 256GB🚨'), 'iphone 13 256 gb');
});

test('containsKeyword: palabra completa y variantes', () => {
  const t = normalizeText('Vendo iPhone 13 128GB liberado de fábrica');
  assert.ok(containsKeyword(t, '128gb'));
  assert.ok(containsKeyword(t, '128 GB'));
  assert.ok(containsKeyword(t, 'liberado de fabrica'));
  assert.ok(!containsKeyword(t, '12'));
  assert.ok(!containsKeyword(normalizeText('iPhone 130'), '13'));
  assert.ok(!containsKeyword(t, '   '));
});

test('rechaza por precio, vendido o antigüedad', () => {
  const w = watcherInput({ minPrice: 200, maxPrice: 350, maxAgeHours: 24 });
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(evaluateListing(makeListing({ id: '1', price: 150 }), w, now).verdict, 'reject');
  assert.equal(evaluateListing(makeListing({ id: '1', price: 400 }), w, now).verdict, 'reject');
  assert.equal(evaluateListing(makeListing({ id: '1', price: null }), w, now).verdict, 'reject');
  assert.equal(evaluateListing(makeListing({ id: '1', isSold: true }), w, now).verdict, 'reject');
  const old = makeListing({ id: '1', listedAt: '2026-10-06T12:00:00Z' });
  assert.equal(evaluateListing(old, w, now).reason, 'publicación muy antigua');
  assert.equal(evaluateListing(makeListing({ id: '1' }), w, now).verdict, 'match');
});

test('keywords excluidas descartan', () => {
  const w = watcherInput({ excludeKeywords: ['repuesto', 'piezas'] });
  const ev = evaluateListing(makeListing({ id: '1', title: 'Iphone+para+repuesto' }), w);
  assert.equal(ev.verdict, 'reject');
  assert.equal(ev.reason, 'contiene "repuesto"');
});

test('keywords obligatorias: modo all / any', () => {
  const l = makeListing({ id: '1', title: 'iPhone 13 128GB' });
  assert.equal(evaluateListing(l, watcherInput({ mustKeywords: ['13', '128gb'] })).verdict, 'match');
  assert.equal(evaluateListing(l, watcherInput({ mustKeywords: ['13', 'liberado'] })).verdict, 'reject');
  assert.equal(
    evaluateListing(l, watcherInput({ mustKeywords: ['13', 'liberado'], mustMode: 'any' })).verdict,
    'match',
  );
});

test('con searchDescription: pide detalle si falta descripción, decide cuando la tiene', () => {
  const w = watcherInput({ mustKeywords: ['liberado'], excludeKeywords: ['icloud bloqueado'], searchDescription: true });
  const noDesc = makeListing({ id: '1', title: 'iPhone 13' });
  assert.equal(evaluateListing(noDesc, w).verdict, 'needs_detail');

  // Cumple por título: se muestra ya, pero queda pendiente revisar exclusiones en la descripción.
  const titleOk = evaluateListing(makeListing({ id: '1', title: 'iPhone 13 liberado' }), w);
  assert.equal(titleOk.verdict, 'match');
  assert.equal(titleOk.descriptionPending, true);
  const noExcludes = { ...w, excludeKeywords: [] };
  assert.equal(evaluateListing(makeListing({ id: '1', title: 'iPhone 13 liberado' }), noExcludes).descriptionPending, false);

  const withDesc = evaluateListing({ ...noDesc, description: 'Liberado de fábrica' }, w);
  assert.equal(withDesc.verdict, 'match');
  assert.equal(withDesc.descriptionPending, false);
  assert.equal(evaluateListing({ ...noDesc, description: 'Liberado pero iCloud bloqueado' }, w).verdict, 'reject');
  // Descripción vacía = detalle ya revisado sin texto: se decide solo con el título.
  assert.equal(evaluateListing({ ...noDesc, description: '' }, w).verdict, 'reject');
});

test('sin searchDescription nunca pide detalle', () => {
  const w = watcherInput({ mustKeywords: ['liberado'], searchDescription: false });
  assert.equal(evaluateListing(makeListing({ id: '1', title: 'iPhone 13' }), w).verdict, 'reject');
});

test('precio ideal y puntuación', () => {
  const w = watcherInput({ maxPrice: 400, idealPrice: 250, bonusKeywords: ['bateria 9', '128gb'] });
  const cheap = evaluateListing(makeListing({ id: '1', price: 200, title: 'iPhone 13 128GB' }), w);
  const ideal = evaluateListing(makeListing({ id: '2', price: 250 }), w);
  const pricey = evaluateListing(makeListing({ id: '3', price: 400 }), w);
  assert.ok(cheap.isIdealPrice && ideal.isIdealPrice && !pricey.isIdealPrice);
  assert.ok(cheap.score > ideal.score, `${cheap.score} > ${ideal.score}`);
  assert.ok(ideal.score > pricey.score, `${ideal.score} > ${pricey.score}`);
  assert.deepEqual(cheap.matchedKeywords, ['128gb']);
});

test('computeScore premia lo recién publicado y se mantiene en 0–100', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const fresh = makeListing({ id: '1', listedAt: '2026-10-08T11:30:00Z' });
  const old = makeListing({ id: '2', listedAt: '2026-10-01T11:30:00Z' });
  assert.equal(computeScore(fresh, { minPrice: null, maxPrice: null, idealPrice: null }, 0, now), 60);
  assert.equal(computeScore(old, { minPrice: null, maxPrice: null, idealPrice: null }, 0, now), 50);
  const best = makeListing({ id: '3', price: 0, listedAt: '2026-10-08T11:59:00Z' });
  assert.equal(computeScore(best, { minPrice: null, maxPrice: 400, idealPrice: 250 }, 10, now), 100);
});
