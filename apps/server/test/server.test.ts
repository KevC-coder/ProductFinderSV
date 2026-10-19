import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// La carpeta de datos se define al importar config.ts: hay que fijarla antes de importar
// cualquier módulo que lo use (también helpers.js), por eso todo se importa después.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfsv-data-'));
process.env.PFSV_DATA_DIR = dataDir;
const { watcherInput } = await import('./helpers.js');
const { paths } = await import('../src/config.js');
const { startServer } = await import('../src/server.js');
const { createStore } = await import('../src/db/store.js');
const { reconcileAutostart } = await import('../src/desktop/autostart.js');

const dbFile = path.join(dataDir, 'productfindersv.db');
const logFile = path.join(dataDir, 'logs', 'server.log');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('un servicio que no consigue el puerto no toca la corrida en curso del servicio activo', async () => {
  assert.equal(paths.data, dataDir);
  // Corrida a medias del servicio que está funcionando.
  const store = createStore(dbFile);
  const w = store.watchers.create(watcherInput());
  const runId = store.runs.start(w.id, new Date().toISOString());
  store.db.close();

  const busy = net.createServer();
  await new Promise<void>((r) => busy.listen(0, '127.0.0.1', () => r()));
  const { port } = busy.address() as net.AddressInfo;

  await assert.rejects(startServer({ port, logFile }), (err: NodeJS.ErrnoException) => err.code === 'EADDRINUSE');
  busy.close();

  const check = createStore(dbFile);
  assert.equal(check.runs.list().find((r) => r.id === runId)?.status, 'running');
  check.db.close();

  // El que sí consigue el puerto da por interrumpida la corrida huérfana.
  const server = await startServer({ port: 0, logFile });
  await server.stop();
  const after = createStore(dbFile);
  assert.equal(after.runs.list().find((r) => r.id === runId)?.status, 'error');
  after.db.close();
});

test('inicio con Windows: guarda la elección de instalaciones anteriores y la restaura solo al reinstalar', async () => {
  let enabled = false;
  const autostart = { isEnabled: async () => enabled, setEnabled: async (v: boolean) => void (enabled = v) };
  const reconcile = (wanted: boolean | null, firstStartAfterInstall: boolean) =>
    reconcileAutostart({ wanted, firstStartAfterInstall, autostart });

  // Nunca eligió y no hay clave: sigue sin elección.
  assert.deepEqual(await reconcile(null, true), { wanted: null, restored: false });
  // Instalación anterior con la clave puesta: se toma como elegida.
  enabled = true;
  assert.deepEqual(await reconcile(null, false), { wanted: true, restored: false });

  // Reinstaló conservando los datos: la clave falta y es el primer arranque → se restaura.
  enabled = false;
  assert.deepEqual(await reconcile(true, true), { wanted: true, restored: true });
  assert.equal(enabled, true);

  // La quitó después con otra herramienta: en arranques normales se respeta.
  enabled = false;
  assert.deepEqual(await reconcile(true, false), { wanted: true, restored: false });
  assert.equal(enabled, false);

  // Si eligió que no, nunca se activa.
  assert.deepEqual(await reconcile(false, true), { wanted: false, restored: false });
  assert.equal(enabled, false);
});
