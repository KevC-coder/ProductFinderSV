import type { BrowserMode, SessionState } from '../domain/types.js';
import { firstPage, openBrowser } from './browser.js';
import { pause } from './human.js';
import { fetchListingDetail } from './listing-detail.js';
import {
  searchMarketplace,
  type SearchOptions,
  type SearchParams,
  type SearchResult,
} from './marketplace-search.js';
import type { Listing } from './parsers/listing.js';
import { withTimeout } from '../runner/timeout.js';
import { hasSessionCookie, interactiveLogin } from './session.js';

/**
 * Tope de una corrida completa. Si Edge o Facebook se cuelgan, se cierra el navegador y la
 * corrida termina con error: el bot no puede quedarse bloqueado para siempre.
 */
export const RUN_TIMEOUT_MS = 10 * 60_000;

export interface ScrapeSession {
  search(params: SearchParams, opts?: SearchOptions): Promise<SearchResult>;
  detail(id: string): Promise<Listing | null>;
}

/** Abstracción del navegador: la lógica de negocio no conoce Playwright (y se puede probar sin él). */
export interface Scraper {
  /** Abre el navegador, verifica la sesión y ejecuta fn. Lanza SessionError si no hay sesión. */
  withSession<T>(fn: (session: ScrapeSession) => Promise<T>): Promise<T>;
  /** Abre una ventana visible para que el usuario inicie sesión. */
  login(): Promise<boolean>;
}

export class SessionError extends Error {
  constructor(readonly state: Exclude<SessionState, 'connected'>) {
    super(state === 'checkpoint' ? 'Facebook pide una verificación de seguridad' : 'No hay sesión de Facebook');
  }
}

export function createPlaywrightScraper(opts: { mode: () => BrowserMode }): Scraper {
  return {
    async withSession(fn) {
      const ctx = await openBrowser({ mode: opts.mode() });
      try {
        if (!(await hasSessionCookie(ctx))) throw new SessionError('logged_out');
        const page = await firstPage(ctx);
        const work = fn({
          search: (params, searchOpts) => searchMarketplace(page, params, searchOpts),
          async detail(id) {
            await pause(3000, 7000);
            return fetchListingDetail(page, id);
          },
        });
        // Al vencer, cerrar el navegador hace fallar lo que Playwright tuviera pendiente.
        return await withTimeout(work, RUN_TIMEOUT_MS, () => void ctx.close().catch(() => {}));
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    login: () => interactiveLogin(),
  };
}
