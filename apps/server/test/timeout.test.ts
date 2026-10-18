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
