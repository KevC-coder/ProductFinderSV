import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { defaults, EDGE_DIRS, paths } from '../config.js';
import type { BrowserMode } from '../domain/types.js';

export interface OpenBrowserOptions {
  mode?: BrowserMode;
}

/** Versión instalada de Edge, leída del nombre de su carpeta (p. ej. "154.0.3390.51"). */
function installedEdgeVersion(): string | null {
  for (const dir of EDGE_DIRS) {
    try {
      const versions = fs.readdirSync(dir).filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d));
      if (versions.length) return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]!;
    } catch {
      // carpeta inexistente
    }
  }
  return null;
}

/** En modo oculto Edge se anuncia como "HeadlessChrome"; usamos el user agent de un Edge normal. */
function headlessUserAgent(): string | undefined {
  const version = installedEdgeVersion();
  if (!version) return undefined;
  const major = version.split('.')[0];
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    `Chrome/${major}.0.0.0 Safari/537.36 Edg/${version}`
  );
}

/**
 * Abre Microsoft Edge (preinstalado en Windows) con un perfil persistente propio de la app.
 * La sesión de Facebook vive en ese perfil; la app nunca maneja la contraseña.
 * Solo un proceso puede usar el perfil a la vez.
 */
export async function openBrowser(opts: OpenBrowserOptions = {}): Promise<BrowserContext> {
  fs.mkdirSync(paths.browserProfile, { recursive: true });
  const mode = opts.mode ?? 'visible';
  const headless = mode === 'headless';
  const args = ['--disable-blink-features=AutomationControlled'];
  if (mode === 'offscreen') {
    // Ventana normal pero fuera de la pantalla. Sin el cálculo de oclusión de Windows, Edge
    // no la considera tapada y sigue pintando la página (necesario para el scroll infinito).
    args.push('--window-position=-32000,-32000', '--disable-features=CalculateNativeWinOcclusion');
  }
  return chromium.launchPersistentContext(paths.browserProfile, {
    channel: 'msedge',
    headless,
    userAgent: headless ? headlessUserAgent() : undefined,
    viewport: { width: 1280, height: 900 },
    locale: defaults.locale,
    timezoneId: defaults.timezone,
    args,
  });
}

export async function firstPage(ctx: BrowserContext): Promise<Page> {
  return ctx.pages()[0] ?? (await ctx.newPage());
}
