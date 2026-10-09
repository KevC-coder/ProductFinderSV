import type { SessionState } from '../domain/types.js';
import type { BrowserContext } from 'playwright-core';
import { firstPage, openBrowser } from './browser.js';
import { sleep } from './human.js';

/** Facebook pone la cookie `c_user` (id del usuario) solo cuando la sesión está iniciada. */
export async function hasSessionCookie(ctx: BrowserContext): Promise<boolean> {
  const cookies = await ctx.cookies('https://www.facebook.com');
  return cookies.some((c) => c.name === 'c_user' && c.value !== '');
}

/** Detecta por la URL si Facebook nos mandó al login o a una verificación de seguridad. */
export function sessionStateFromUrl(url: string): SessionState | null {
  if (/facebook\.com\/checkpoint\b/.test(url)) return 'checkpoint';
  if (/facebook\.com\/(login|recover)\b/.test(url)) return 'logged_out';
  return null;
}

/**
 * Abre una ventana visible de Edge en facebook.com y espera a que el usuario inicie sesión
 * manualmente. Devuelve true si se detectó la sesión antes del timeout.
 */
export async function interactiveLogin(timeoutMs = 5 * 60_000): Promise<boolean> {
  // El login siempre en una ventana visible: el usuario tiene que escribir sus datos.
  const ctx = await openBrowser({ mode: 'visible' });
  try {
    const page = await firstPage(ctx);
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (page.isClosed()) return false;
      if ((await hasSessionCookie(ctx)) && sessionStateFromUrl(page.url()) === null) {
        // Dar tiempo a que Facebook termine de escribir cookies/almacenamiento en el perfil.
        await sleep(3000);
        return true;
      }
      await sleep(2000);
    }
    return false;
  } finally {
    await ctx.close();
  }
}
