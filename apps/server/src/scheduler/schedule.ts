/**
 * Cálculo de horarios (funciones puras). Todo se expresa en la hora local del PC,
 * así "07:00–23:00" significa lo mismo que ve el usuario en su reloj.
 */

const DAY_MINUTES = 24 * 60;
const MINUTE = 60_000;

export interface ScheduleRules {
  /** Separación mínima entre corridas de una misma búsqueda. */
  minIntervalMinutes: number;
  /** Variación aleatoria del intervalo, en % (20 → ±20 %). */
  jitterPercent: number;
  /** Espera tras el primer error; se duplica en cada error consecutivo. */
  errorBackoffMinutes: number;
  maxBackoffMinutes: number;
}

export interface WatcherSchedule {
  runsPerDay: number;
  windowStart: string;
  windowEnd: string;
}

export type Random = () => number;

export function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Duración de la ventana en minutos. Admite ventanas que cruzan medianoche (22:00–02:00). */
export function windowMinutes(start: string, end: string): number {
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === e) return DAY_MINUTES;
  return e > s ? e - s : DAY_MINUTES - s + e;
}

export function isWithinWindow(d: Date, start: string, end: string): boolean {
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === e) return true;
  const m = minuteOfDay(d);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Próximo inicio de la ventana a partir de d (o d mismo si ya está dentro). */
export function nextWindowStart(d: Date, start: string, end: string): Date {
  if (isWithinWindow(d, start, end)) return d;
  const s = parseHM(start);
  const next = new Date(d);
  next.setHours(Math.floor(s / 60), s % 60, 0, 0);
  if (next.getTime() <= d.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

/** Intervalo base: la ventana repartida entre las corridas del día, nunca menos del mínimo. */
export function baseIntervalMinutes(w: WatcherSchedule, rules: ScheduleRules): number {
  return Math.max(rules.minIntervalMinutes, windowMinutes(w.windowStart, w.windowEnd) / Math.max(1, w.runsPerDay));
}

/** Si la hora cae fuera de la ventana, la mueve al inicio de la siguiente con un pequeño desfase aleatorio. */
function clampToWindow(d: Date, w: WatcherSchedule, intervalMin: number, random: Random): Date {
  if (isWithinWindow(d, w.windowStart, w.windowEnd)) return d;
  const start = nextWindowStart(d, w.windowStart, w.windowEnd);
  // Repartir el arranque para que todas las búsquedas no empiecen a las 07:00 en punto.
  const spread = random() * Math.min(intervalMin / 2, 30);
  return new Date(start.getTime() + spread * MINUTE);
}

/** Próxima corrida tras una corrida exitosa (o la primera, si from = ahora y first = true). */
export function computeNextRun(
  w: WatcherSchedule,
  from: Date,
  rules: ScheduleRules,
  random: Random,
  opts: { first?: boolean } = {},
): Date {
  const interval = baseIntervalMinutes(w, rules);
  if (opts.first) {
    // Una búsqueda nueva corre pronto (1–3 min) si estamos dentro de su horario.
    const soon = new Date(from.getTime() + (1 + random() * 2) * MINUTE);
    return clampToWindow(soon, w, interval, random);
  }
  const jitter = (random() * 2 - 1) * (rules.jitterPercent / 100);
  const next = new Date(from.getTime() + interval * (1 + jitter) * MINUTE);
  return clampToWindow(next, w, interval, random);
}

/** Próxima corrida tras `failures` errores consecutivos (backoff exponencial con tope). */
export function computeBackoff(
  w: WatcherSchedule,
  from: Date,
  failures: number,
  rules: ScheduleRules,
  random: Random,
): Date {
  const wait = Math.min(rules.errorBackoffMinutes * 2 ** Math.max(0, failures - 1), rules.maxBackoffMinutes);
  const next = new Date(from.getTime() + wait * (0.9 + random() * 0.2) * MINUTE);
  return clampToWindow(next, w, baseIntervalMinutes(w, rules), random);
}
