import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/db/store.js';
import { appLink, routeFromLink } from '../src/desktop/links.js';
import { powershellArgs, psString } from '../src/desktop/powershell.js';
import { trayScript } from '../src/desktop/tray.js';
import { buildRunNotification, notifyRun, type Notice, type Notifier } from '../src/notifier/notification.js';
import { toastScript, toastXml } from '../src/notifier/windows-toast.js';
import { runWatcher } from '../src/runner/run-watcher.js';
import { fakeScraper, makeListing, watcherInput } from './helpers.js';

function recorder() {
  const sent: Notice[] = [];
  const notifier: Notifier = { notify: async (n) => void sent.push(n) };
  return { sent, notifier };
}

/** Búsqueda con precio ideal 280 y una corrida que encuentra dos publicaciones. */
async function setup(listings = [makeListing({ id: '1', title: 'iPhone 13 liberado', price: 260 }), makeListing({ id: '2', price: 330 })]) {
  const store = createStore(':memory:');
  const w = store.watchers.create(watcherInput({ name: 'iPhone 13', idealPrice: 280, maxPrice: 400 }));
  let current = listings;
  const { scraper } = fakeScraper({ listings: () => current });
  const run = () => runWatcher(store, scraper, store.watchers.get(w.id)!);
  return { store, w, run, setListings: (l: typeof listings) => (current = l) };
}

test('aviso de corrida: cuenta nuevos, destaca el de mayor puntuación y abre sus resultados', async () => {
  const { store, w, run } = await setup();
  const summary = await run();
  const { sent, notifier } = recorder();

  const notice = await notifyRun(store, notifier, summary);
  assert.deepEqual(sent, [notice]);
  assert.equal(notice!.title, 'iPhone 13: 2 resultados nuevos');
  assert.equal(notice!.lines[0], '$260 · iPhone 13 liberado · Precio ideal');
  assert.equal(notice!.lines[1], 'Y 1 más en el panel.');
  assert.equal(notice!.route, `resultados?watcher=${w.id}`);
  // Quedan marcados como notificados.
  assert.ok(store.matches.list({ watcherId: w.id }).items.every((m) => m.notifiedAt));
});

test('aviso de bajada de precio con el precio anterior', async () => {
  const { store, run, setListings } = await setup([makeListing({ id: '1', title: 'iPhone 13', price: 320 })]);
  await run();
  setListings([makeListing({ id: '1', title: 'iPhone 13', price: 270 })]);
  const summary = await run();
  assert.equal(summary.newMatchIds.length, 0);

  const { sent, notifier } = recorder();
  await notifyRun(store, notifier, summary);
  assert.equal(sent[0]!.title, 'iPhone 13: 1 bajó de precio');
  assert.equal(sent[0]!.lines[0], '$270 (antes $320) · iPhone 13 · Precio ideal');
});

test('modos de aviso: solo precio ideal, apagado y descartados', async () => {
  const { store, run } = await setup();
  const summary = await run();
  const { sent, notifier } = recorder();

  store.settings.set({ notifyMode: 'ideal' });
  const ideal = await notifyRun(store, notifier, summary);
  assert.equal(ideal!.title, 'iPhone 13: 1 resultado nuevo');
  assert.equal(ideal!.lines.length, 1);

  store.settings.set({ notifyMode: 'off' });
  assert.equal(await notifyRun(store, notifier, summary), null);

  store.settings.set({ notifyMode: 'all' });
  for (const id of summary.newMatchIds) store.matches.setStatus(id, 'dismissed');
  assert.equal(await notifyRun(store, notifier, summary), null);
  assert.equal(sent.length, 1);
});

test('sin novedades o corrida fallida no hay aviso', async () => {
  const { store, run } = await setup();
  await run();
  const again = await run(); // las mismas publicaciones: nada nuevo
  const { sent, notifier } = recorder();
  assert.equal(await notifyRun(store, notifier, again), null);
  assert.equal(await notifyRun(store, notifier, { ...again, status: 'error', newMatchIds: [1] }), null);
  assert.equal(sent.length, 0);
  assert.equal(buildRunNotification({ id: 1, name: 'x' }, [], []), null);
});

test('XML del aviso: escapa caracteres especiales y quita los no válidos', () => {
  const xml = toastXml(
    { title: 'Búsqueda <1> & "2"', lines: ['$10 · Funda\u0001 iPhone’s'], route: 'resultados?watcher=1' },
    appLink('resultados?watcher=1&x=1'),
  );
  assert.match(xml, /<text>Búsqueda &lt;1&gt; &amp; &quot;2&quot;<\/text>/);
  assert.match(xml, /<text>\$10 · Funda iPhone’s<\/text>/);
  assert.match(xml, /launch="productfindersv:\/\/resultados\?watcher=1&amp;x=1"/);
  assert.doesNotMatch(xml, /\u0001/);
});

test('PowerShell: comillas simples y tipográficas no rompen los literales', () => {
  assert.equal(psString("O'Brien"), "'O''Brien'");
  assert.equal(psString('Apple’s'), "'Apple’’s'");
  assert.equal(psString('C:\\Users\\Ana María\\x.exe'), "'C:\\Users\\Ana María\\x.exe'");

  const script = toastScript(toastXml({ title: 'Apple’s', lines: [], route: 'inicio' }, 'productfindersv://inicio'), "C:\\a'b\\icon.png");
  assert.match(script, /LoadXml\('<toast .*Apple’’s.*'\)/);
  assert.match(script, /IconUri -Value 'C:\\a''b\\icon\.png'/);
  assert.match(trayScript({ exePath: "C:\\Users\\O'Neil\\ProductFinderSV.exe", port: 8787, parentPid: 42 }), /\$exe = 'C:\\Users\\O''Neil\\ProductFinderSV\.exe'/);

  // -EncodedCommand: UTF-16 LE en base64, conserva acentos.
  const args = powershellArgs("Write-Output 'búsqueda'");
  assert.equal(Buffer.from(args.at(-1)!, 'base64').toString('utf16le'), "Write-Output 'búsqueda'");
});

test('enlaces productfindersv:// solo abren pantallas del panel', () => {
  assert.equal(appLink('resultados?watcher=3'), 'productfindersv://resultados?watcher=3');
  assert.equal(routeFromLink('productfindersv://resultados?watcher=3'), 'resultados?watcher=3');
  // Windows a veces agrega una barra antes de la consulta o al final.
  assert.equal(routeFromLink('productfindersv://resultados/?watcher=3'), 'resultados?watcher=3');
  assert.equal(routeFromLink('productfindersv://ajustes/'), 'ajustes');
  assert.equal(routeFromLink('productfindersv://Busquedas'), 'busquedas');
  assert.equal(routeFromLink(undefined), 'inicio');
  assert.equal(routeFromLink('https://evil.example/'), 'inicio');
  assert.equal(routeFromLink('productfindersv://inicio" --flag'), 'inicio');
  assert.equal(routeFromLink('productfindersv://../../x'), 'inicio');
});
