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
const { restoreAutostart } = await import('../src/desktop/autostart.js');

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

test('restaura el inicio con Windows si el usuario lo había elegido y la clave ya no está', async () => {
  let enabled = false;
  const autostart = { isEnabled: async () => enabled, setEnabled: async (v: boolean) => void (enabled = v) };
  assert.equal(await restoreAutostart(null, autostart), false);
  assert.equal(await restoreAutostart(false, autostart), false);
  assert.equal(enabled, false);
  assert.equal(await restoreAutostart(true, autostart), true);
  assert.equal(enabled, true);
  assert.equal(await restoreAutostart(true, autostart), false, 'si ya está, no hace nada');
});
