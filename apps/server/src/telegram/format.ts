import type { MatchView } from '../db/matches.js';
import type { SessionState } from '../domain/types.js';
import { formatPrice, truncateText, type RunNews } from '../notifier/notification.js';
import type { InlineButton } from './api.js';

/** Límites de Telegram: texto de un mensaje y pie de una foto. */
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

/** Escapa texto para parse_mode HTML (en atributos también las comillas). */
export const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');

/** Comandos que entiende el bot (también se registran en el menú de Telegram). */
export const COMMANDS = [
  { command: 'estado', description: 'Cómo está el bot y la próxima búsqueda' },
  { command: 'pausar', description: 'Pausar las búsquedas automáticas' },
  { command: 'reanudar', description: 'Reanudar las búsquedas automáticas' },
  { command: 'ayuda', description: 'Qué puedo hacer' },
] as const;

export const HELP_TEXT = [
  '<b>ProductFinderSV</b>',
  'Te aviso aquí cuando una búsqueda automática encuentra resultados nuevos o bajadas de precio.',
  '',
  ...COMMANDS.map((c) => `/${c.command} · ${c.description}`),
].join('\n');

const dateTime = new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' });
const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const byScore = (a: MatchView, b: MatchView) => b.score - a.score;

function itemLines(m: MatchView, index: number, isDrop: boolean): string {
  const l = m.listing;
  const short = truncateText(l.title ?? 'Sin título', 90);
  const details = [formatPrice(l.price)];
  if (isDrop && l.previousPrice != null && l.price != null && l.previousPrice > l.price) {
    details[0] += ` (antes ${formatPrice(l.previousPrice)})`;
  }
  if (m.isIdealPrice) details.push('Precio ideal');
  if (l.location) details.push(escapeHtml(l.location));
  return `${index}. <a href="${escapeAttr(l.url)}">${escapeHtml(short)}</a>\n${details.join(' · ')}`;
}

export interface RunMessage {
  /** HTML (parse_mode HTML). Cabe en el pie de foto si hay `photo`. */
  text: string;
  /** Foto del mejor resultado, si tiene. */
  photo: string | null;
  button: InlineButton;
}

/**
 * Un mensaje por búsqueda: cuántos resultados nuevos y bajadas de precio hubo y los mejores
 * (por puntuación) con enlace a Facebook. La foto es la del mejor.
 */
export function runMessage(news: RunNews, maxItems = 5): RunMessage {
  const { watcher, fresh, drops } = news;
  const parts: string[] = [];
  if (fresh.length) parts.push(fresh.length === 1 ? '1 resultado nuevo' : `${fresh.length} resultados nuevos`);
  if (drops.length) parts.push(drops.length === 1 ? '1 bajó de precio' : `${drops.length} bajaron de precio`);

  const items = [
    ...fresh.map((m) => ({ m, isDrop: false })),
    ...drops.map((m) => ({ m, isDrop: true })),
  ].sort((a, b) => byScore(a.m, b.m));
  const best = items[0]!.m;
  const photo = best.listing.imageUrl ?? null;
  const limit = photo ? CAPTION_LIMIT : TEXT_LIMIT;

  // El orden es la puntuación del bot: se explica qué mide en vez de llamar "el mejor" a nadie.
  const header =
    `<b>${escapeHtml(watcher.name)}</b>: ${parts.join(' · ')}\n` +
    '<i>Ordenados por puntuación: precio frente a tu precio ideal, keywords deseables y antigüedad.</i>';
  const footer = (rest: number) => (rest > 0 ? `\n\n${rest === 1 ? 'Y 1 más' : `Y ${rest} más`} en el panel de ProductFinderSV.` : '');
  let body = '';
  let shown = 0;
  for (const { m, isDrop } of items.slice(0, maxItems)) {
    const next = `${body}\n\n${itemLines(m, shown + 1, isDrop)}`;
    // Siempre debe caber el pie con los que no se muestran.
    if ((header + next + footer(items.length - shown - 1)).length > limit) break;
    body = next;
    shown++;
  }
  return {
    text: header + body + footer(items.length - shown),
    photo,
    button: { text: 'Ver el n.º 1 en Facebook', url: best.listing.url },
  };
}

/** Avisos sobre la cuenta de Facebook, que necesitan que el usuario haga algo en la PC. */
export function sessionAlert(state: SessionState): string | null {
  if (state === 'checkpoint') {
    return (
      '<b>Facebook pidió una verificación de seguridad.</b>\n' +
      'El bot se pausó para proteger tu cuenta. En la PC, abre ProductFinderSV, pulsa “Conectar Facebook”, ' +
      'resuelve la verificación y luego “Ya resolví la verificación, reanudar”.'
    );
  }
  if (state === 'logged_out') {
    return (
      '<b>Se cerró la sesión de Facebook.</b>\n' +
      'Las búsquedas no pueden continuar. En la PC, abre ProductFinderSV y pulsa “Conectar Facebook”.'
    );
  }
  return null;
}

/** Lo que el comando /estado necesita saber del bot. */
export interface StatusSnapshot {
  sessionState: SessionState | 'unknown';
  schedulerEnabled: boolean;
  pausedUntil: string | null;
  searching: boolean;
  nextRun: { name: string; at: string } | null;
  newMatches: number;
  activeWatchers: number;
}

const SESSION_TEXT: Record<StatusSnapshot['sessionState'], string> = {
  connected: 'conectado',
  logged_out: 'sin sesión (conéctalo desde la PC)',
  checkpoint: 'pide una verificación (resuélvela desde la PC)',
  unknown: 'sin verificar todavía',
};

export function statusText(s: StatusSnapshot, now = new Date()): string {
  const paused = s.pausedUntil && Date.parse(s.pausedUntil) > now.getTime();
  const bot = s.searching
    ? 'buscando ahora mismo'
    : !s.schedulerEnabled
      ? 'pausado (usa /reanudar)'
      : paused
        ? `en pausa por seguridad hasta ${formatDateTime(s.pausedUntil!)}`
        : 'activo';
  const lines = [
    '<b>ProductFinderSV</b>',
    `Facebook: ${SESSION_TEXT[s.sessionState]}`,
    `Búsquedas automáticas: ${bot}`,
    `Búsquedas activas: ${s.activeWatchers}`,
    `Resultados nuevos sin ver: ${s.newMatches}`,
  ];
  if (s.schedulerEnabled && !paused && s.nextRun) {
    lines.push(`Próxima: “${escapeHtml(s.nextRun.name)}”, ${formatDateTime(s.nextRun.at)}`);
  }
  return lines.join('\n');
}
