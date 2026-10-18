import type { SessionState } from '../domain/types.js';
import type { BrowserContext } from 'playwright-core';
import { firstPage, openBrowser } from './browser.js';
import { sleep } from './human.js';

/**
 * Sesión iniciada = cookies `c_user` (id del usuario) y `xs` (secreto de la sesión). Durante
 * algunos pasos del login Facebook ya pone `c_user` pero la sesión todavía no es válida.
 */
export function hasSessionCookies(cookies: { name: string; value: string }[]): boolean {
  const has = (name: string) => cookies.some((c) => c.name === name && c.value !== '');
  return has('c_user') && has('xs');
}

export async function hasSessionCookie(ctx: BrowserContext): Promise<boolean> {
  return hasSessionCookies(await ctx.cookies('https://www.facebook.com'));
}

/**
 * Detecta por la URL si Facebook nos mandó al login o a una verificación de seguridad
 * (checkpoint, verificación en dos pasos o confirmación de identidad).
 */
export function sessionStateFromUrl(url: string): SessionState | null {
  if (/facebook\.com\/(checkpoint|two_step_verification|two_factor|auth_platform)\b/.test(url)) return 'checkpoint';
  if (/facebook\.com\/(login|recover)\b/.test(url)) return 'logged_out';
  return null;
}

/**
 * Abre una ventana visible de Edge en facebook.com y espera a que el usuario inicie sesión
 * manualmente (con tiempo para esperar el código de la verificación en dos pasos).
 * Devuelve true si se detectó la sesión antes del timeout.
 */
export async function interactiveLogin(timeoutMs = 10 * 60_000): Promise<boolean> {
  // El login siempre en una ventana visible: el usuario tiene que escribir sus datos.
  const ctx = await openBrowser({ mode: 'visible' });
  try {
    const page = await firstPage(ctx);
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + timeoutMs;
    // Dos comprobaciones seguidas: entre pasos del login la página puede pasar un instante
    // por una dirección "normal" antes de redirigir a la verificación.
    let confirmations = 0;
    while (Date.now() < deadline) {
      if (page.isClosed()) return false;
      const ok = (await hasSessionCookie(ctx)) && sessionStateFromUrl(page.url()) === null;
      confirmations = ok ? confirmations + 1 : 0;
      if (confirmations >= 2) {
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
