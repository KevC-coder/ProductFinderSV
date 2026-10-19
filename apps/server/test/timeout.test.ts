import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimeoutError, withTimeout } from '../src/runner/timeout.js';

test('withTimeout: devuelve el resultado si termina a tiempo', async () => {
  let cancelled = false;
  assert.equal(await withTimeout(Promise.resolve(7), 1000, () => (cancelled = true)), 7);
  assert.equal(cancelled, false);
});

test('withTimeout: al vencer rechaza, avisa y no deja rechazos sin manejar', async () => {
  let cancelled = false;
  let rejectLater: (e: Error) => void = () => {};
  const hanging = new Promise<number>((_, reject) => (rejectLater = reject));
  await assert.rejects(withTimeout(hanging, 20, () => (cancelled = true)), TimeoutError);
  assert.equal(cancelled, true);
  // Como el navegador se cierra, la promesa original falla después: no debe romper el proceso.
  rejectLater(new Error('Target closed'));
  await new Promise((r) => setTimeout(r, 10));
});

test('withTimeout: propaga el error original', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 1000), /boom/);
});

test('runWithBrowser: al vencer el tope cierra el navegador y espera a que termine de cerrarse', async () => {
  const { runWithBrowser } = await import('../src/scraper/scraper.js');
  const events: string[] = [];
  const ctx = {
    close: async () => {
      events.push('close:start');
      await new Promise((r) => setTimeout(r, 30));
      events.push('close:end');
    },
  };
  await assert.rejects(runWithBrowser(ctx, () => new Promise(() => {}), 10), TimeoutError);
  events.push('runWithBrowser:done');
  // Un solo cierre, y la cola solo sigue cuando el perfil de Edge quedó libre.
  assert.deepEqual(events, ['close:start', 'close:end', 'runWithBrowser:done']);
});

test('runWithBrowser: cierra también cuando termina bien o con error', async () => {
  const { runWithBrowser } = await import('../src/scraper/scraper.js');
  let closes = 0;
  const ctx = { close: async () => void closes++ };
  assert.equal(await runWithBrowser(ctx, async () => 5, 1000), 5);
  await assert.rejects(runWithBrowser(ctx, async () => Promise.reject(new Error('sin sesión')), 1000), /sin sesión/);
  assert.equal(closes, 2);
});
