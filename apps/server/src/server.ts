import fs from 'node:fs';
import path from 'node:path';
import { buildApp, type ServiceInfo } from './api/app.js';
import { paths } from './config.js';
import { createStore } from './db/store.js';
import { createAutostart, restoreAutostart } from './desktop/autostart.js';
import { appLink } from './desktop/links.js';
import { startTray } from './desktop/tray.js';
import { notifyRun } from './notifier/notification.js';
import { createWindowsNotifier } from './notifier/windows-toast.js';
import { Bot } from './scheduler/bot.js';
import { createPlaywrightScraper } from './scraper/scraper.js';
import { APP_VERSION } from './version.js';

export interface StartOptions {
  port?: number;
  /** Carpeta del panel compilado; si no existe solo se sirve la API. */
  webDir?: string;
  /** Archivo de log. Sin él, los logs van a la consola (modo desarrollo). */
  logFile?: string;
  /**
   * Ruta de ProductFinderSV.exe cuando corre como app de escritorio. Activa el icono de la
   * bandeja, el inicio con Windows y que los avisos abran la ventana de la app.
   */
  desktopExe?: string;
  /** Lo informa el supervisor del servicio (ver desktop/supervisor.ts). */
  service?: ServiceInfo;
}

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Arranca todo el servicio: base de datos, bot programado y API + panel en 127.0.0.1.
 * Lo usan tanto `npm run start` (main.ts) como el ejecutable de escritorio.
 */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? 8787;
  const store = createStore(path.join(paths.data, 'productfindersv.db'));

  const windows = process.platform === 'win32';
  const desktopExe = windows ? opts.desktopExe : undefined;
  const webDir = opts.webDir && fs.existsSync(opts.webDir) ? opts.webDir : undefined;
  const icon = webDir && path.join(webDir, 'icons', 'icon-192.png');
  const notifier = windows
    ? createWindowsNotifier({
        // En la app de escritorio el enlace productfindersv:// abre su propia ventana.
        link: (route) => (desktopExe ? appLink(route) : `http://127.0.0.1:${port}/#/${route}`),
        iconPath: icon && fs.existsSync(icon) ? icon : null,
      })
    : null;
  let stopTray: (() => void) | null = null;

  if (opts.logFile) fs.mkdirSync(path.dirname(opts.logFile), { recursive: true });
  const scraper = createPlaywrightScraper({ mode: () => store.settings.get('browserMode') });
  const bot = new Bot(store, scraper);

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= (async () => {
      stopTray?.();
      bot.stop();
      await app.close();
      store.db.close();
    })());

  const autostart = desktopExe ? createAutostart(desktopExe) : null;
  const app = buildApp({
    store,
    bot,
    logger: opts.logFile ? { level: 'info', file: opts.logFile } : true,
    webDir,
    desktop: autostart ? { autostart, service: opts.service } : undefined,
    onShutdown: async () => {
      // Red de seguridad: si algo bloquea el cierre ordenado, salir igual.
      setTimeout(() => process.exit(0), 5000).unref();
      // Avisa a cualquier otro supervisor que esté esperando para reiniciar: el usuario cerró la app.
      if (desktopExe) {
        try {
          fs.writeFileSync(paths.serviceStopped, new Date().toISOString());
        } catch (err) {
          app.log.warn({ err }, 'no se pudo marcar el cierre del servicio');
        }
      }
      await stop().catch((err) => app.log.error(err, 'error al cerrar'));
      process.exit(0);
    },
  });

  bot.on('run:finished', (s) => {
    app.log.info(
      { watcherId: s.watcherId, status: s.status, found: s.foundCount, new: s.newMatchIds.length, error: s.errorMessage },
      'corrida terminada',
    );
    // "Probar ahora" ya muestra el resultado en el panel; los avisos son para las corridas automáticas.
    if (notifier && !s.manual) {
      notifyRun(store, notifier, s).catch((err) => app.log.warn({ err }, 'no se pudo mostrar el aviso de Windows'));
    }
  });

  // Solo 127.0.0.1: el panel no debe ser accesible desde otros equipos de la red.
  try {
    await app.listen({ host: '127.0.0.1', port });
  } catch (err) {
    store.db.close();
    throw err;
  }
  // El puerto hace de candado: solo el servicio que lo consiguió puede dar por interrumpidas las
  // corridas a medias. Un arranque sobrante (puerto ocupado) no debe tocar la corrida en curso
  // del servicio activo.
  store.runs.failStale();
  // Instalaciones anteriores a la pantalla de bienvenida: si ya hay búsquedas, no mostrarla.
  if (!store.settings.get('riskNoticeAccepted') && store.watchers.list().length) {
    store.settings.set({ riskNoticeAccepted: true });
  }
  bot.start();
  if (desktopExe) {
    stopTray = startTray({ exePath: desktopExe, port }, (err) => app.log.warn({ err }, 'icono de la bandeja'));
  }
  if (autostart) {
    restoreAutostart(store.settings.get('autostartWanted'), autostart)
      .then((restored) => restored && app.log.info('inicio con Windows restaurado'))
      .catch((err) => app.log.warn({ err }, 'no se pudo restaurar el inicio con Windows'));
  }
  app.log.info({ version: APP_VERSION, data: paths.data }, 'ProductFinderSV iniciado');
  return { url: `http://127.0.0.1:${port}`, stop };
}
