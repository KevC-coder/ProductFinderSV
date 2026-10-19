import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/api/app.js';
import { createStore } from '../src/db/store.js';
import type { Evaluation } from '../src/matcher/evaluate.js';
import { runWatcher } from '../src/runner/run-watcher.js';
import { Bot } from '../src/scheduler/bot.js';
import { createTelegramApi, TelegramError, type TelegramApi, type TelegramUpdate } from '../src/telegram/api.js';
import { CAPTION_LIMIT, escapeHtml, runMessage, type StatusSnapshot } from '../src/telegram/format.js';
import { TelegramService } from '../src/telegram/service.js';
import { fakeScraper, makeListing, watcherInput } from './helpers.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const NOW = new Date('2026-10-19T15:00:00Z');
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

type Call = { method: string; params: Record<string, unknown> };

/** API de Telegram falsa: registra las llamadas; getUpdates entrega lotes y luego espera. */
function fakeApi(opts: { getMe?: () => Promise<{ id: number; username: string; first_name: string }>; failPhoto?: boolean } = {}) {
  const calls: Call[] = [];
  const batches: (TelegramUpdate[] | Error)[] = [];
  let wake: (() => void) | null = null;
  /** Entrega un lote al long polling (lo despierta si estaba esperando). */
  const push = (batch: TelegramUpdate[] | Error) => {
    batches.push(batch);
    wake?.();
  };
  const api: TelegramApi = {
    getMe: opts.getMe ?? (async () => ({ id: 1, username: 'MiBuscadorBot', first_name: 'Mi buscador' })),
    async getUpdates(params, signal) {
      calls.push({ method: 'getUpdates', params });
      // Long polling: sin mensajes, espera a que llegue un lote o se cancele.
      while (!batches.length) {
        await new Promise<void>((resolve, reject) => {
          wake = resolve;
          signal?.addEventListener('abort', () => reject(new Error('abortado')));
        });
      }
      const next = batches.shift()!;
      if (next instanceof Error) throw next;
      return next;
    },
    async sendMessage(params) {
      calls.push({ method: 'sendMessage', params: { ...params } });
      return {};
    },
    async sendPhoto(params) {
      calls.push({ method: 'sendPhoto', params: { ...params } });
      if (opts.failPhoto) throw new TelegramError(400, 'Bad Request: wrong file identifier/HTTP URL specified');
      return {};
    },
    async setMyCommands(params) {
      calls.push({ method: 'setMyCommands', params });
      return true;
    },
  };
  return { api, calls, push, sent: () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'sendPhoto') };
}

const status: StatusSnapshot = {
  sessionState: 'connected',
  schedulerEnabled: true,
  pausedUntil: null,
  searching: false,
  nextRun: { name: 'iPhone <13>', at: '2026-10-19T16:00:00Z' },
  newMatches: 3,
  activeWatchers: 2,
};

function setup(apiOpts?: Parameters<typeof fakeApi>[0]) {
  const store = createStore(':memory:');
  const fake = fakeApi(apiOpts);
  const logs: string[] = [];
  const tg = new TelegramService({
    store,
    getStatus: () => status,
    log: { info: (_o, m) => logs.push(m), warn: (_o, m) => logs.push(m) },
    createApi: () => fake.api,
    now: () => NOW,
    sleep: async () => {},
  });
  return { store, tg, ...fake, logs };
}

const message = (text: string, chatId = 555, date = NOW): TelegramUpdate => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: { message_id: 1, date: unix(date), chat: { id: chatId, type: 'private', first_name: 'Ana', last_name: 'López' }, text },
});

async function linked() {
  const ctx = setup();
  await ctx.tg.setToken(TOKEN);
  const { code } = ctx.tg.startLinking();
  await ctx.tg.handleUpdate(message(`/start ${code}`));
  ctx.calls.length = 0;
  return ctx;
}

test('token: valida el formato y con Telegram, y nunca se devuelve', async () => {
  const { tg, store } = setup({
    getMe: async () => {
      throw new TelegramError(401, 'Unauthorized');
    },
  });
  await assert.rejects(tg.setToken('hola'), /no parece un token/);
  await assert.rejects(tg.setToken(TOKEN), /no reconoce ese token/);
  assert.equal(store.settings.get('telegramToken'), null);

  const ok = setup();
  const state = await ok.tg.setToken(`  ${TOKEN}  `);
  assert.deepEqual(
    { configured: state.configured, bot: state.botUsername, linked: state.linked },
    { configured: true, bot: 'MiBuscadorBot', linked: false },
  );
  assert.equal(ok.store.settings.get('telegramToken'), TOKEN);
  assert.equal(JSON.stringify(state).includes(TOKEN), false);
  await ok.tg.stop();
});

test('sin conexión al validar el token: mensaje claro (502)', async () => {
  const { tg } = setup({
    getMe: async () => {
      throw new TelegramError(0, 'No se pudo conectar con Telegram');
    },
  });
  await assert.rejects(tg.setToken(TOKEN), (err: Error & { statusCode?: number }) => {
    assert.equal(err.statusCode, 502);
    assert.match(err.message, /conexión a internet/);
    return true;
  });
});

test('vincular: solo con el código de un solo uso; el resto de chats se ignora', async () => {
  const { tg, store, calls } = setup();
  await tg.setToken(TOKEN);
  assert.throws(() => setup().tg.startLinking(), /Primero guarda el token/);

  const link = tg.startLinking();
  assert.match(link.url, /^https:\/\/t\.me\/MiBuscadorBot\?start=[A-Za-z0-9_-]{16}$/);
  assert.ok(tg.state().linking);

  await tg.handleUpdate(message('/start otro-codigo', 999));
  await tg.handleUpdate(message('/estado', 999));
  assert.equal(store.settings.get('telegramChatId'), null);
  assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 0, 'a desconocidos no se les responde');

  await tg.handleUpdate(message(`/start ${link.code}`, 555));
  const state = tg.state();
  assert.equal(state.linked, true);
  assert.equal(state.chatName, 'Ana López');
  assert.equal(state.linking, null, 'el código ya no sirve');
  assert.ok(calls.some((c) => c.method === 'setMyCommands'));
  assert.match(String(calls.find((c) => c.method === 'sendMessage')?.params.text), /quedó vinculado/);

  // El mismo código no vincula otro chat.
  await tg.handleUpdate(message(`/start ${link.code}`, 777));
  assert.equal(store.settings.get('telegramChatId'), '555');
  await tg.stop();
});

test('vincular: solo desde un chat privado, y el chat anterior se entera del cambio', async () => {
  const { tg, store, calls } = await linked();
  const link = tg.startLinking();
  const group: TelegramUpdate = {
    update_id: 1,
    message: { message_id: 1, date: unix(NOW), chat: { id: -100123, type: 'group', title: 'Familia' }, text: `/start@MiBuscadorBot ${link.code}` },
  };
  await tg.handleUpdate(group);
  assert.equal(store.settings.get('telegramChatId'), '555');
  assert.match(String(calls.at(-1)?.params.text), /chat privado/);
  assert.ok(tg.state().linking, 'el código sigue valiendo');

  await tg.handleUpdate(message(`/start ${link.code}`, 888));
  assert.equal(store.settings.get('telegramChatId'), '888');
  const toOld = calls.find((c) => c.method === 'sendMessage' && c.params.chat_id === '555');
  assert.match(String(toOld?.params.text), /otro chat \(Ana López\)/);
  await tg.stop();
});

test('comandos desde el chat vinculado: estado, pausar y reanudar', async () => {
  const { tg, store, calls } = await linked();
  const lastText = () => String(calls.filter((c) => c.method === 'sendMessage').at(-1)?.params.text);

  await tg.handleUpdate(message('/estado'));
  assert.match(lastText(), /Facebook: conectado/);
  assert.match(lastText(), /Resultados nuevos sin ver: 3/);
  assert.match(lastText(), /iPhone &lt;13&gt;/, 'escapa HTML');

  await tg.handleUpdate(message('/pausar'));
  assert.equal(store.settings.get('schedulerEnabled'), false);
  assert.match(lastText(), /pausadas/);

  store.settings.set({ pausedUntil: '2026-10-19T20:00:00Z' });
  await tg.handleUpdate(message('/REANUDAR@MiBuscadorBot'));
  assert.equal(store.settings.get('schedulerEnabled'), true);
  assert.match(lastText(), /sigue <b>en pausa por seguridad<\/b>/);

  const before = calls.length;
  await tg.handleUpdate(message('/pausar@OtroBot'));
  assert.equal(store.settings.get('schedulerEnabled'), true, 'comando para otro bot');
  assert.equal(calls.length, before);
  // Órdenes que llegaron con la PC apagada: no se ejecutan, se avisa.
  await tg.handleUpdate(message('/pausar'), { backlog: true });
  assert.equal(store.settings.get('schedulerEnabled'), true);
  assert.match(lastText(), /mientras ProductFinderSV estaba apagado y no lo ejecuté/);

  await tg.handleUpdate(message('hola'));
  assert.match(lastText(), /No entendí/);
  await tg.stop();
});

async function runWith(store: ReturnType<typeof createStore>, listings: ReturnType<typeof makeListing>[]) {
  const w = store.watchers.create(watcherInput({ name: 'iPhone 13', idealPrice: 280, maxPrice: 400 }));
  const { scraper } = fakeScraper({ listings });
  return runWatcher(store, scraper, store.watchers.get(w.id)!);
}

test('aviso por búsqueda: foto del mejor, lista y botón; vuelve a texto si la foto falla', async () => {
  const { tg, store, calls } = await linked();
  const summary = await runWith(store, [
    makeListing({ id: '1', title: 'iPhone 13 <liberado>', price: 260, imageUrl: 'https://scontent.example/1.jpg' }),
    makeListing({ id: '2', title: 'iPhone 13', price: 330 }),
  ]);
  const ids = await tg.notifyRun(summary);
  assert.equal(ids.length, 2);
  const photo = calls.find((c) => c.method === 'sendPhoto')!;
  assert.equal(photo.params.photo, 'https://scontent.example/1.jpg');
  assert.equal(photo.params.chat_id, '555');
  const caption = String(photo.params.caption);
  assert.match(caption, /^<b>iPhone 13<\/b>: 2 resultados nuevos/);
  assert.match(caption, /1\. <a href="https:\/\/www\.facebook\.com\/marketplace\/item\/1\/">iPhone 13 &lt;liberado&gt;<\/a>\n\$260 · Precio ideal/);
  assert.deepEqual(photo.params.reply_markup, {
    inline_keyboard: [[{ text: 'Ver el n.º 1 en Facebook', url: 'https://www.facebook.com/marketplace/item/1/' }]],
  });
  assert.ok(store.matches.get(ids[0]!)!.notifiedAt);

  const failing = setup({ failPhoto: true });
  await failing.tg.setToken(TOKEN);
  const { code } = failing.tg.startLinking();
  await failing.tg.handleUpdate(message(`/start ${code}`));
  failing.calls.length = 0;
  const s2 = await runWith(failing.store, [makeListing({ id: '9', price: 250, imageUrl: 'https://x/9.jpg' })]);
  await failing.tg.notifyRun(s2);
  assert.deepEqual(
    failing.calls.map((c) => c.method),
    ['sendPhoto', 'sendMessage'],
  );
  await tg.stop();
  await failing.tg.stop();
});

test('aviso por búsqueda: respeta el modo de Telegram y no avisa sin chat vinculado', async () => {
  const notLinked = setup();
  await notLinked.tg.setToken(TOKEN);
  const s0 = await runWith(notLinked.store, [makeListing({ id: '1', price: 260 })]);
  assert.deepEqual(await notLinked.tg.notifyRun(s0), []);
  await notLinked.tg.stop();

  const { tg, store, sent } = await linked();
  tg.setNotifyMode('ideal');
  const s1 = await runWith(store, [makeListing({ id: '2', price: 390 })]); // no es precio ideal
  assert.deepEqual(await tg.notifyRun(s1), []);
  tg.setNotifyMode('off');
  const s2 = await runWith(store, [makeListing({ id: '3', price: 250 })]);
  assert.deepEqual(await tg.notifyRun(s2), []);
  assert.equal(sent().length, 0);
  await tg.stop();
});

test('mensaje por búsqueda: cabe en el pie de foto aunque haya muchos resultados largos', () => {
  const store = createStore(':memory:');
  const w = store.watchers.create(watcherInput({ name: 'Búsqueda con un nombre bastante largo para probar límites' }));
  const ev: Evaluation = { verdict: 'match', score: 60, matchedKeywords: [], isIdealPrice: false, descriptionPending: false, reason: null };
  const matches = Array.from({ length: 12 }, (_, i) => {
    const id = String(100 + i);
    store.listings.upsert(
      makeListing({ id, title: 'Título muy largo '.repeat(10), location: 'San Salvador, El Salvador', imageUrl: 'https://x/a.jpg' }),
    );
    return store.matches.get(store.matches.upsert(w.id, id, { ...ev, score: 90 - i }).id)!;
  });
  const msg = runMessage({ watcher: w, fresh: matches, drops: [] });
  assert.ok(msg.text.length <= CAPTION_LIMIT, `${msg.text.length} > ${CAPTION_LIMIT}`);
  assert.match(msg.text, /^<b>Búsqueda con un nombre bastante largo para probar límites<\/b>: 12 resultados nuevos/);
  assert.match(msg.text, /Y \d+ más en el panel de ProductFinderSV\.$/);
  // El primero que se muestra es el de mayor puntuación.
  assert.match(msg.text, /1\. <a href="https:\/\/www\.facebook\.com\/marketplace\/item\/100\/">/);
});

test('alertas de la cuenta de Facebook: una vez por problema', async () => {
  const { tg, sent } = await linked();
  await tg.notifySession('checkpoint');
  await tg.notifySession('checkpoint');
  assert.equal(sent().length, 1);
  assert.match(String(sent()[0]!.params.text), /verificación de seguridad/);
  await tg.notifySession('connected');
  await tg.notifySession('checkpoint');
  await tg.notifySession('logged_out');
  assert.equal(sent().length, 3);
  await tg.stop();
});

test('escucha mensajes con long polling y se detiene limpio', async () => {
  const { tg, store, push, calls } = setup();
  await tg.setToken(TOKEN);
  const { code } = tg.startLinking();
  push([{ ...message(`/start ${code}`), update_id: 41 }]);
  // Dejar correr el bucle de escucha.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.settings.get('telegramChatId'), '555');
  const polls = calls.filter((c) => c.method === 'getUpdates');
  assert.equal(polls.at(-1)!.params.offset, 42, 'confirma los mensajes ya leídos');
  assert.equal(polls[0]!.params.timeout, 0, 'primero lee lo acumulado sin esperar');
  assert.equal(polls.at(-1)!.params.timeout, 50);
  await tg.stop();
});

test('al arrancar, las órdenes acumuladas con la PC apagada no se ejecutan', async () => {
  const { tg, store, push } = await linked();
  await tg.stop();
  push([{ ...message('/pausar'), update_id: 7 }]);
  tg.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.settings.get('schedulerEnabled'), true);
  // Las que llegan después sí.
  push([{ ...message('/pausar'), update_id: 8 }]);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.settings.get('schedulerEnabled'), false);
  await tg.stop();
});

test('token revocado o bot usado en otra PC: se informa en Ajustes', async () => {
  const revoked = setup();
  revoked.push(new TelegramError(401, 'Unauthorized'));
  await revoked.tg.setToken(TOKEN);
  await new Promise((r) => setTimeout(r, 20));
  assert.match(revoked.tg.state().error!, /ya no acepta el token/);
  await revoked.tg.stop();

  const conflict = setup();
  conflict.push(new TelegramError(409, 'Conflict: terminated by other getUpdates request'));
  await conflict.tg.setToken(TOKEN);
  await new Promise((r) => setTimeout(r, 20));
  assert.match(conflict.tg.state().error!, /otra PC/);
  await conflict.tg.stop();
});

test('cliente de la API: errores de Telegram y de red sin filtrar el token', async () => {
  const calls: string[] = [];
  const ok = createTelegramApi(TOKEN, async (url, init) => {
    calls.push(`${url} ${String(init.body)}`);
    return new Response(JSON.stringify({ ok: true, result: { id: 1, username: 'B', first_name: 'B' } }));
  });
  assert.equal((await ok.getMe()).username, 'B');
  assert.equal(calls[0], `https://api.telegram.org/bot${TOKEN}/getMe {}`);

  const limited = createTelegramApi(TOKEN, async () =>
    new Response(JSON.stringify({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } }), { status: 429 }),
  );
  await assert.rejects(limited.sendMessage({ chat_id: '1', text: 'x' }), (err: TelegramError) => err.code === 429 && err.retryAfter === 7);

  const offline = createTelegramApi(TOKEN, async () => {
    throw new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/getMe`);
  });
  await assert.rejects(offline.getMe(), (err: TelegramError) => err.code === 0 && !err.message.includes(TOKEN));
});

test('el recorte de títulos no parte emojis (Telegram rechazaría el aviso)', () => {
  const store = createStore(':memory:');
  const w = store.watchers.create(watcherInput());
  store.listings.upsert(makeListing({ id: '1', title: `${'x'.repeat(88)}🔥 negociable y en buen estado` }));
  const ev: Evaluation = { verdict: 'match', score: 60, matchedKeywords: [], isIdealPrice: false, descriptionPending: false, reason: null };
  const m = store.matches.get(store.matches.upsert(w.id, '1', ev).id)!;
  const text = runMessage({ watcher: w, fresh: [m], drops: [] }).text;
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), false);
  assert.match(text, /x{88}🔥…/);
});

test('cliente de la API: nunca envía surrogates sueltos', async () => {
  let body = '';
  const api = createTelegramApi(TOKEN, async (_url, init) => {
    body = String(init.body);
    return new Response(JSON.stringify({ ok: true, result: {} }));
  });
  await api.sendMessage({ chat_id: '1', text: `roto \uD83D fin` });
  assert.equal(JSON.parse(body).text, 'roto \uFFFD fin');
});

test('errores al enviar: quedan visibles hasta que vuelve a funcionar; un 401 pide el token nuevo', async () => {
  const { tg, store } = await linked();
  let fail: TelegramError | null = new TelegramError(403, 'Forbidden: bot was blocked by the user');
  const api = (tg as unknown as { api: TelegramApi }).api;
  const original = api.sendMessage;
  api.sendMessage = async (p) => {
    if (fail) throw fail;
    return original(p);
  };
  await assert.rejects(tg.notifySession('checkpoint'));
  assert.match(tg.state().error!, /bloqueaste/);
  // No se marcó como avisado: se reintenta en la próxima corrida.
  fail = null;
  await tg.notifySession('checkpoint');
  assert.equal(tg.state().error, null, 'se limpia al volver a enviar bien');

  fail = new TelegramError(401, 'Unauthorized');
  await assert.rejects(tg.sendTest(), /token/);
  assert.equal(tg.state().tokenRejected, true);
  assert.throws(() => tg.startLinking(), /token nuevo/);
  // Un token nuevo del mismo bot conserva el chat vinculado.
  fail = null;
  const after = await tg.setToken(TOKEN);
  assert.deepEqual([after.tokenRejected, after.linked], [false, true]);
  assert.equal(store.settings.get('telegramChatId'), '555');
  await tg.stop();
});

test('foto rechazada → texto; corte de red → no se reenvía (evita duplicados)', async () => {
  const { tg, store, calls } = await linked();
  const api = (tg as unknown as { api: TelegramApi }).api;
  api.sendPhoto = async () => {
    throw new TelegramError(0, 'No se pudo conectar con Telegram');
  };
  const summary = await runWith(store, [makeListing({ id: '1', price: 250, imageUrl: 'https://x/1.jpg' })]);
  await assert.rejects(tg.notifyRun(summary));
  assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 0);
  await tg.stop();
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('API /api/telegram y /api/settings sin el token', async () => {
  const store = createStore(':memory:');
  const bot = new Bot(store, fakeScraper({ listings: [] }).scraper);
  const fake = fakeApi();
  const telegram = new TelegramService({
    store,
    getStatus: () => status,
    log: { info: () => {}, warn: () => {} },
    createApi: () => fake.api,
    sleep: async () => {},
  });
  const app = buildApp({ store, bot, telegram });

  const initial = (await app.inject({ method: 'GET', url: '/api/telegram' })).json();
  assert.equal(initial.configured, false);
  assert.equal((await app.inject({ method: 'POST', url: '/api/telegram/link' })).statusCode, 409);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/telegram/token', payload: { token: 'x' } })).statusCode, 400);

  const saved = await app.inject({ method: 'PUT', url: '/api/telegram/token', payload: { token: TOKEN } });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().botUsername, 'MiBuscadorBot');
  const settings = (await app.inject({ method: 'GET', url: '/api/settings' })).body;
  assert.equal(settings.includes(TOKEN), false);
  assert.equal(settings.includes('telegram'), false);

  const test409 = await app.inject({ method: 'POST', url: '/api/telegram/test' });
  assert.equal(test409.statusCode, 409);
  assert.match(test409.json().error, /vincula tu chat/);

  const link = (await app.inject({ method: 'POST', url: '/api/telegram/link' })).json();
  assert.match(link.linking.url, /t\.me\/MiBuscadorBot\?start=/);
  await telegram.handleUpdate(message(`/start ${link.linking.code}`));
  assert.equal((await app.inject({ method: 'POST', url: '/api/telegram/test' })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/telegram', payload: { notifyMode: 'ideal' } })).json().notifyMode, 'ideal');
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/telegram', payload: { notifyMode: 'x' } })).statusCode, 400);

  const off = (await app.inject({ method: 'DELETE', url: '/api/telegram' })).json();
  assert.deepEqual([off.configured, off.linked], [false, false]);
  assert.equal(store.settings.get('telegramToken'), null);
  await telegram.stop();
});
