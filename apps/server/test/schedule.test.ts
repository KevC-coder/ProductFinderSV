import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  baseIntervalMinutes,
  computeBackoff,
  computeNextRun,
  isWithinWindow,
  nextWindowStart,
  windowMinutes,
} from '../src/scheduler/schedule.js';

// Fechas en hora local (como las ve el usuario), independientes de la zona horaria del PC.
const at = (h: number, m = 0, day = 8) => new Date(2026, 9, day, h, m);
const rules = { minIntervalMinutes: 30, jitterPercent: 20, errorBackoffMinutes: 15, maxBackoffMinutes: 240 };
const half = () => 0.5; // sin jitter
const day = { runsPerDay: 6, windowStart: '07:00', windowEnd: '23:00' };

test('ventanas normales, de 24 h y que cruzan medianoche', () => {
  assert.equal(windowMinutes('07:00', '23:00'), 960);
  assert.equal(windowMinutes('22:00', '02:00'), 240);
  assert.equal(windowMinutes('00:00', '00:00'), 1440);

  assert.ok(isWithinWindow(at(7), '07:00', '23:00'));
  assert.ok(!isWithinWindow(at(23), '07:00', '23:00'));
  assert.ok(!isWithinWindow(at(6, 59), '07:00', '23:00'));
  assert.ok(isWithinWindow(at(1), '22:00', '02:00'));
  assert.ok(isWithinWindow(at(22, 30), '22:00', '02:00'));
  assert.ok(!isWithinWindow(at(12), '22:00', '02:00'));
  assert.ok(isWithinWindow(at(3), '00:00', '00:00'));
});

test('nextWindowStart', () => {
  assert.deepEqual(nextWindowStart(at(10), '07:00', '23:00'), at(10));
  assert.deepEqual(nextWindowStart(at(3), '07:00', '23:00'), at(7));
  assert.deepEqual(nextWindowStart(at(23, 30), '07:00', '23:00'), at(7, 0, 9));
});

test('intervalo: ventana repartida entre corridas, con mínimo', () => {
  assert.equal(baseIntervalMinutes(day, rules), 160);
  assert.equal(baseIntervalMinutes({ ...day, runsPerDay: 48 }, rules), 30);
});

test('primera corrida: pronto si está en horario, si no al abrir la ventana', () => {
  assert.deepEqual(computeNextRun(day, at(10), rules, half, { first: true }), at(10, 2));
  const night = computeNextRun(day, at(3), rules, half, { first: true });
  assert.ok(night >= at(7) && night <= at(7, 30), night.toString());
});

test('siguiente corrida con jitter dentro de ±20 %', () => {
  assert.deepEqual(computeNextRun(day, at(10), rules, half), at(12, 40));
  assert.deepEqual(computeNextRun(day, at(10), rules, () => 0), new Date(at(10).getTime() + 128 * 60_000));
  assert.deepEqual(computeNextRun(day, at(10), rules, () => 1), new Date(at(10).getTime() + 192 * 60_000));
});

test('si la siguiente cae fuera de horario pasa al día siguiente', () => {
  const next = computeNextRun(day, at(22), rules, half);
  assert.ok(next >= at(7, 0, 9) && next <= at(7, 30, 9), next.toString());
});

test('backoff exponencial con tope', () => {
  const mins = (n: number) => (computeBackoff(day, at(10), n, rules, half).getTime() - at(10).getTime()) / 60_000;
  assert.equal(mins(1), 15);
  assert.equal(mins(2), 30);
  assert.equal(mins(3), 60);
  assert.equal(mins(10), 240);
});
