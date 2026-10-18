import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXIT_CODES, restartDelayMs, Supervisor, type WorkerHandle } from '../src/desktop/supervisor.js';

/** Reloj y temporizadores manuales: advance(ms) dispara lo que toque en orden. */
function fakeTime() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; every?: number }>();
  const add = (fn: () => void, ms: number, every?: number) => {
    const id = ++seq;
    timers.set(id, { at: t + ms, fn, every });
    return () => void timers.delete(id);
  };
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => add(fn, ms),
    setRepeat: (fn: () => void, ms: number) => add(fn, ms, ms),
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, x] = next;
        t = x.at;
        if (x.every) x.at += x.every;
        else timers.delete(id);
        x.fn();
        await new Promise((r) => setImmediate(r)); // deja correr las promesas (probe)
      }
      t = end;
    },
  };
}

function fakeWorkers() {
  const workers: { restarts: number; killed: boolean; exit: (code: number | null) => void }[] = [];
  const spawnWorker = ({ restarts }: { restarts: number }): WorkerHandle => {
    let cb: (code: number | null) => void = () => {};
    const w = {
      restarts,
      killed: false,
      exit: (code: number | null) => cb(code),
    };
    workers.push(w);
    return {
      kill: () => {
        w.killed = true;
        cb(null);
      },
      onExit: (fn) => void (cb = fn),
    };
  };
  return { workers, spawnWorker };
}

test('espera creciente entre reinicios', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(restartDelayMs), [2_000, 5_000, 15_000, 60_000, 300_000, 300_000]);
});

test('reinicia el servicio si se cae y termina cuando el usuario lo cierra', async () => {
  const time = fakeTime();
  const { workers, spawnWorker } = fakeWorkers();
  const logs: string[] = [];
  const sup = new Supervisor({ spawnWorker, probe: async () => true, log: (m) => logs.push(m), ...time });
  let finished: number | null = null;
  void sup.run().then((code) => (finished = code));

  assert.equal(workers.length, 1);
  workers[0]!.exit(1); // caída
  await time.advance(1_999);
  assert.equal(workers.length, 1, 'espera antes de reiniciar');
  await time.advance(1);
  assert.equal(workers.length, 2);
  assert.equal(workers[1]!.restarts, 1, 'el servicio sabe cuántas veces se reinició');

  workers[1]!.exit(null); // segunda caída seguida: espera más
  await time.advance(4_999);
  assert.equal(workers.length, 2);
  await time.advance(1);
  assert.equal(workers.length, 3);

  workers[2]!.exit(EXIT_CODES.shutdown);
  await time.advance(600_000);
  assert.equal(workers.length, 3, 'no se reinicia tras un cierre pedido');
  assert.equal(finished, 0);
  assert.match(logs.join('\n'), /reinicio automático n\.º 2 en 5 s/);
});

test('no reinicia si ya había otro servicio en marcha', async () => {
  const time = fakeTime();
  const { workers, spawnWorker } = fakeWorkers();
  const sup = new Supervisor({ spawnWorker, probe: async () => true, log: () => {}, ...time });
  const done = sup.run();
  workers[0]!.exit(EXIT_CODES.alreadyRunning);
  assert.equal(await done, EXIT_CODES.alreadyRunning);
  await time.advance(600_000);
  assert.equal(workers.length, 1);
});

test('si el servicio deja de responder lo mata y lo reinicia', async () => {
  const time = fakeTime();
  const { workers, spawnWorker } = fakeWorkers();
  let healthy = true;
  const logs: string[] = [];
  const sup = new Supervisor({
    spawnWorker,
    probe: async () => healthy,
    log: (m) => logs.push(m),
    healthIntervalMs: 60_000,
    startupGraceMs: 120_000,
    maxMissedChecks: 3,
    ...time,
  });
  void sup.run();

  healthy = false;
  // Durante el arranque no se comprueba: 2 min de gracia.
  await time.advance(120_000);
  assert.equal(workers[0]!.killed, false);
  await time.advance(3 * 60_000);
  assert.equal(workers[0]!.killed, true);
  assert.match(logs.join('\n'), /no responde/);
  await time.advance(2_000);
  assert.equal(workers.length, 2, 'se reinicia tras matarlo');
});

test('un fallo aislado de la comprobación no reinicia', async () => {
  const time = fakeTime();
  const { workers, spawnWorker } = fakeWorkers();
  let calls = 0;
  const sup = new Supervisor({
    spawnWorker,
    probe: async () => ++calls % 3 !== 0, // falla 1 de cada 3
    log: () => {},
    startupGraceMs: 0,
    ...time,
  });
  void sup.run();
  await time.advance(30 * 60_000);
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.killed, false);
});

test('tras funcionar un buen rato, la siguiente caída vuelve a la espera corta', async () => {
  const time = fakeTime();
  const { workers, spawnWorker } = fakeWorkers();
  const sup = new Supervisor({ spawnWorker, probe: async () => true, log: () => {}, stableAfterMs: 600_000, ...time });
  void sup.run();
  workers[0]!.exit(1);
  await time.advance(2_000);
  workers[1]!.exit(1);
  await time.advance(5_000);
  // El tercero funciona 15 min antes de caer: espera corta otra vez.
  await time.advance(15 * 60_000);
  workers[2]!.exit(1);
  await time.advance(2_000);
  assert.equal(workers.length, 4);
});
