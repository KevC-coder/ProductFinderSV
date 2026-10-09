import type { MatchView } from '../db/matches.js';
import type { Store } from '../db/store.js';
import type { Watcher } from '../domain/types.js';
import type { RunSummary } from '../runner/run-watcher.js';

/** Aviso al usuario, independiente de cómo se muestre (Windows, o Telegram en el futuro). */
export interface Notice {
  title: string;
  /** Una o dos líneas de detalle. */
  lines: string[];
  /** Ruta del panel que abre el aviso, p. ej. "resultados?watcher=3". */
  route: string;
}

export interface Notifier {
  notify(notice: Notice): Promise<void>;
}

const money0 = new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** Igual que formatPrice del panel: "$250", "$249.99", "Gratis". */
export function formatPrice(price: number | null): string {
  if (price == null) return 'Sin precio';
  if (price === 0) return 'Gratis';
  return Number.isInteger(price) ? money0.format(price) : money2.format(price);
}

const byScore = (a: MatchView, b: MatchView) => b.score - a.score;

function describe(m: MatchView): string {
  const l = m.listing;
  let price = formatPrice(l.price);
  if (l.previousPrice != null && l.price != null && l.previousPrice > l.price) {
    price += ` (antes ${formatPrice(l.previousPrice)})`;
  }
  const title = (l.title ?? 'Sin título').replace(/\s+/g, ' ').trim();
  const short = title.length > 80 ? `${title.slice(0, 79)}…` : title;
  return `${price} · ${short}${m.isIdealPrice ? ' · Precio ideal' : ''}`;
}

/**
 * Arma el aviso de una corrida: cuántos resultados nuevos y bajadas de precio hubo, y el
 * de mayor puntuación como ejemplo. null si no hay nada que avisar.
 */
export function buildRunNotification(
  watcher: Pick<Watcher, 'id' | 'name'>,
  fresh: MatchView[],
  drops: MatchView[],
): Notice | null {
  if (!fresh.length && !drops.length) return null;
  const parts: string[] = [];
  if (fresh.length) parts.push(fresh.length === 1 ? '1 resultado nuevo' : `${fresh.length} resultados nuevos`);
  if (drops.length) parts.push(drops.length === 1 ? '1 bajó de precio' : `${drops.length} bajaron de precio`);

  const best = [...fresh].sort(byScore)[0] ?? [...drops].sort(byScore)[0]!;
  const lines = [describe(best)];
  const rest = fresh.length + drops.length - 1;
  if (rest > 0) lines.push(rest === 1 ? 'Y 1 más en el panel.' : `Y ${rest} más en el panel.`);

  return { title: `${watcher.name}: ${parts.join(' · ')}`, lines, route: `resultados?watcher=${watcher.id}` };
}

/**
 * Avisa de lo que encontró una corrida según el ajuste notifyMode y marca esos resultados
 * como notificados. No avisa de resultados que el usuario ya descartó.
 */
export async function notifyRun(
  store: Store,
  notifier: Notifier,
  run: RunSummary,
  now = new Date(),
): Promise<Notice | null> {
  const mode = store.settings.get('notifyMode');
  if (mode === 'off' || run.status !== 'ok') return null;
  const watcher = store.watchers.get(run.watcherId);
  if (!watcher) return null;

  const pick = (ids: number[]) =>
    ids
      .map((id) => store.matches.get(id))
      .filter((m): m is MatchView => !!m && m.status !== 'dismissed' && (mode === 'all' || m.isIdealPrice));
  const fresh = pick(run.newMatchIds);
  const drops = pick(run.priceDropMatchIds);
  const notice = buildRunNotification(watcher, fresh, drops);
  if (!notice) return null;

  await notifier.notify(notice);
  store.matches.markNotified(
    [...fresh, ...drops].map((m) => m.id),
    now.toISOString(),
  );
  return notice;
}
