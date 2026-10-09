import type { Tone } from '../components/ui';
import type { BlockedReason, ItemCondition, RunStatus, SessionState } from './types';

const money0 = new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  if (price === 0) return 'Gratis';
  return Number.isInteger(price) ? money0.format(price) : money2.format(price);
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "hace 5 minutos", "en 2 horas", "ayer"… */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = Date.parse(iso) - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'minute') {
      const value = Math.round(diff / ms);
      return value === 0 ? 'ahora' : rtf.format(value, unit);
    }
  }
  return '—';
}

const dateTime = new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('es-SV', { timeStyle: 'short' });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—');

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  new: 'Nuevo',
  used_like_new: 'Usado – como nuevo',
  used_good: 'Usado – buen estado',
  used_fair: 'Usado – aceptable',
};

export const SESSION_LABELS: Record<SessionState, string> = {
  connected: 'Facebook conectado',
  logged_out: 'Sin sesión de Facebook',
  checkpoint: 'Facebook pide verificación',
  unknown: 'Sesión sin verificar',
};

export const BLOCKED_LABELS: Record<BlockedReason, string> = {
  disabled: 'Bot apagado',
  logged_out: 'Esperando inicio de sesión',
  paused: 'En pausa por seguridad',
  rate_limit: 'Límite de corridas por hora alcanzado',
  cooldown: 'Pausa entre corridas',
  busy: 'Buscando…',
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'En curso',
  ok: 'Completada',
  error: 'Error',
  checkpoint: 'Verificación',
  logged_out: 'Sin sesión',
};

/** Color de cada estado de corrida (siempre acompañado de RUN_STATUS_LABELS). */
export const RUN_STATUS_TONE: Record<RunStatus, Tone> = {
  running: 'brand',
  ok: 'success',
  error: 'danger',
  checkpoint: 'warning',
  logged_out: 'warning',
};

/** "1 nuevo", "3 nuevos". */
export const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n === 1 ? singular : pluralForm}`;

export function durationSeconds(start: string, end: string | null): string {
  if (!end) return '—';
  const s = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
