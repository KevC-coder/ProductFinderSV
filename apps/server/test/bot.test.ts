import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/db/store.js';
import { Bot } from '../src/scheduler/bot.js';
import type { Scraper } from '../src/scraper/scraper.js';
import { fakeScraper, makeListing, watcherInput } from './helpers.js';

/** Reloj manual en hora local. */
function clock(h = 10, m = 0) {
  let t = new Date(2026, 9, 8, h, m);
  return {
    now: () => t,
    advance: (minutes: number) => (t = new Date(t.getTime() + minutes * 60_000)),
  };
}

function setup(opts: { scraper?: Scraper; h?: number } = {}) {
  const store = createStore(':memory:');
  const c = clock(opts.h);
  const scraper = opts.scraper ?? fakeScraper({ listings: [makeListing({ id: '1' })] }).scraper;
  const bot = new Bot(store, scraper, { now: c.now, random: () => 0.5 });
  const addWatcher = (overrides = {}) => {
    const w = store.watchers.create(watcherInput(overrides));
    bot.onWatcherSaved(w);
    return store.watchers.get(w.id)!;
  };
  return { store, bot, c, addWatcher };
}

async function tickAndWait(bot: Bot) {
  const r = await bot.tick();
  if ('started' in r) return r.started;
  return r.blocked;
}

const minutesBetween = (a: string | null, b: Date) => (Date.parse(a!) - b.getTime()) / 60_000;

test('programa la primera corrida y la ejecuta cuando toca', async () => {
  const { store, bot, c, addWatcher } = setup();
  const w = addWatcher();
  assert.equal(minutesBetween(w.nextRunAt, c.now()), 2);
  assert.equal(await tickAndWait(bot), 'nothing_due');

  c.advance(3);
  const summary = await tickAndWait(bot);
  assert.equal(typeof summary === 'object' && summary.status, 'ok');
  // 6 corridas en 07:00–23:00 → cada 160 min (sin jitter con random = 0.5).
  assert.equal(minutesBetween(store.watchers.get(w.id)!.nextRunAt, c.now()), 160);
});

test('fuera de horario espera a que abra la ventana', () => {
  const { addWatcher } = setup({ h: 3 });
  const w = addWatcher();
  const next = new Date(w.nextRunAt!);
  assert.equal(next.getHours(), 7);
});

test('pausa mínima entre corridas de distintas búsquedas', async () => {
  const { store, bot, c, addWatcher } = setup();
  addWatcher();
  addWatcher();
  c.advance(3);
  await tickAndWait(bot);
  assert.equal(await tickAndWait(bot), 'cooldown');
  c.advance(2);
  await tickAndWait(bot);
  assert.equal(store.runs.list().length, 2);
});

test('tope de corridas por hora', async () => {
  const { store, bot, c, addWatcher } = setup();
  store.settings.set({ maxRunsPerHour: 2, minGapSeconds: 30 });
  addWatcher();
  addWatcher();
  addWatcher();
  c.advance(3);
  await tickAndWait(bot);
  c.advance(1);
  await tickAndWait(bot);
  c.advance(1);
  assert.equal(await tickAndWait(bot), 'rate_limit');
  c.advance(60);
  assert.notEqual(await tickAndWait(bot), 'rate_limit');
  assert.equal(store.runs.list().length, 3);
});

test('interruptor general del bot', async () => {
  const { store, bot, c, addWatcher } = setup();
  addWatcher();
  store.settings.set({ schedulerEnabled: false });
  c.advance(3);
  assert.equal(await tickAndWait(bot), 'disabled');
  assert.equal(bot.status().blockedReason, 'disabled');
});

test('checkpoint: pausa todo el bot y se puede reanudar', async () => {
  const { scraper } = fakeScraper({ listings: [], sessionState: 'checkpoint' });
  const { store, bot, c, addWatcher } = setup({ scraper });
  const w = addWatcher();
  c.advance(3);
  await tickAndWait(bot);

  const paused = store.settings.get('pausedUntil');
  assert.equal(minutesBetween(paused, c.now()), 8 * 60);
  assert.ok(Date.parse(store.watchers.get(w.id)!.nextRunAt!) >= Date.parse(paused!));
  c.advance(30);
  assert.equal(await tickAndWait(bot), 'paused');

  bot.resume();
  assert.notEqual(bot.blockedReason(), 'paused');
});

test('errores: reintento con espera creciente y reinicio al tener éxito', async () => {
  let fail = true;
  const scraper: Scraper = {
    withSession: (fn) =>
      fail ? Promise.reject(new Error('timeout')) : fakeScraper({ listings: [] }).scraper.withSession(fn),
    login: async () => true,
  };
  const { store, bot, c, addWatcher } = setup({ scraper });
  const w = addWatcher();
  store.settings.set({ minGapSeconds: 30 });

  c.advance(3);
  await tickAndWait(bot);
  let current = store.watchers.get(w.id)!;
  assert.equal(current.consecutiveFailures, 1);
  assert.equal(minutesBetween(current.nextRunAt, c.now()), 15);

  c.advance(15);
  await tickAndWait(bot);
  current = store.watchers.get(w.id)!;
  assert.equal(current.consecutiveFailures, 2);
  assert.equal(minutesBetween(current.nextRunAt, c.now()), 30);

  fail = false;
  c.advance(30);
  await tickAndWait(bot);
  assert.equal(store.watchers.get(w.id)!.consecutiveFailures, 0);
});

test('sin sesión: bloquea hasta iniciar sesión', async () => {
  const { scraper } = fakeScraper({ listings: [], sessionState: 'logged_out' });
  const { store, bot, c, addWatcher } = setup({ scraper });
  addWatcher();
  c.advance(3);
  await tickAndWait(bot);
  assert.equal(store.settings.get('sessionState'), 'logged_out');
  assert.equal(bot.blockedReason(), 'logged_out');

  assert.equal(await bot.login(), true);
  assert.equal(store.settings.get('sessionState'), 'connected');
});

test('"probar ahora" ignora el horario pero no se encola dos veces', async () => {
  const { store, bot, addWatcher } = setup({ h: 3 });
  const w = addWatcher();
  const first = bot.runNow(w.id);
  assert.ok(first);
  assert.equal(bot.runNow(w.id), null);
  await Promise.resolve();
  assert.equal(bot.status().searchingWatcherId, w.id);
  assert.equal((await first).status, 'ok');
  assert.equal(store.runs.list().length, 1);
});

test('editar la búsqueda recalcula el horario solo si cambian campos de horario', () => {
  const { store, bot, c, addWatcher } = setup();
  const w = addWatcher();
  c.advance(1);

  bot.onWatcherSaved(store.watchers.update(w.id, { maxPrice: 300 })!, { maxPrice: 300 });
  assert.equal(store.watchers.get(w.id)!.nextRunAt, w.nextRunAt);

  bot.onWatcherSaved(store.watchers.update(w.id, { runsPerDay: 3 })!, { runsPerDay: 3 });
  assert.notEqual(store.watchers.get(w.id)!.nextRunAt, w.nextRunAt);

  bot.onWatcherSaved(store.watchers.update(w.id, { active: false })!, { active: false });
  assert.equal(store.watchers.get(w.id)!.nextRunAt, null);
});

test('status informa la próxima corrida', () => {
  const { bot, addWatcher } = setup();
  addWatcher({ name: 'Bici' });
  const s = bot.status();
  assert.equal(s.nextRun?.name, 'Bici');
  assert.equal(s.blockedReason, null);
  assert.equal(s.runsLastHour, 0);
});

test('el evento de corrida terminada indica si fue "Probar ahora" o automática', async () => {
  const { bot, c, addWatcher } = setup();
  const w = addWatcher();
  const seen: boolean[] = [];
  bot.on('run:finished', (s) => seen.push(s.manual));

  const manual = await bot.runNow(w.id);
  assert.equal(manual?.manual, true);
  c.advance(200); // después de la próxima corrida programada
  await tickAndWait(bot);
  assert.deepEqual(seen, [true, false]);
});
