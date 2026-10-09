import type { Match, Watcher } from './types';

/**
 * El resultado coincide por título pero su descripción aún no se revisó. Solo importa si la
 * búsqueda usa la descripción para descartar (misma regla que el matcher del servidor).
 */
export function isDescriptionPending(match: Match, watcher: Watcher | undefined): boolean {
  return !!watcher && watcher.searchDescription && watcher.excludeKeywords.length > 0 && !match.listing.detailFetchedAt;
}
