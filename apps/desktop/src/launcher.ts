/**
 * ProductFinderSV.exe — punto de entrada del ejecutable (Node SEA).
 *
 * Doble clic (modo lanzador):
 *   1. Si ya hay un servicio de ProductFinderSV de otra versión, le pide cerrarse.
 *   2. Se copia a %LOCALAPPDATA%\Programs\ProductFinderSV, crea accesos directos y se registra
 *      en Windows (enlaces productfindersv://, Aplicaciones instaladas).
 *   3. Arranca el servicio en segundo plano (este mismo .exe con --server).
 *   4. Abre el panel en una ventana de aplicación (Edge --app) y termina.
 *
 * El servicio son dos procesos sin ventana, independientes de la ventana del panel:
 * --server      Supervisor: extrae la app embebida (servidor + panel + Playwright) la primera
 *               vez, lanza --worker y lo reinicia si se cae o deja de responder.
 * --worker      El servicio en sí: API, panel, bot e icono de la bandeja.
 * --background  Como el doble clic pero sin abrir la ventana (inicio con Windows, si el
 *               usuario lo activó en la bienvenida o en Ajustes).
 * --open <url>  Abre el panel en una pantalla concreta (clic en un aviso: productfindersv://…).
 * --uninstall   Desinstala (desde Configuración → Aplicaciones de Windows).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getAsset } from 'node:sea';
import { setTimeout as sleep } from 'node:timers/promises';
import zlib from 'node:zlib';
// Solo módulos sin dependencias: esbuild los incluye en el lanzador.
import { DEFAULT_PORT, EDGE_DIRS, paths } from '../../server/src/config.js';
import {
  cleanupScript,
  messageBoxScript,
  registerScript,
  unregisterScript,
  type MessageBoxButtons,
  type MessageBoxIcon,
} from '../../server/src/desktop/install-scripts.js';
import { routeFromLink } from '../../server/src/desktop/links.js';
import { powershellArgs, spawnPowerShell } from '../../server/src/desktop/powershell.js';
import { EXIT_CODES, Supervisor } from '../../server/src/desktop/supervisor.js';
import { VERSION_HEADER } from '../../server/src/version.js';

/** Versión + huella del contenido: distingue recompilaciones de la misma versión. */
declare const __BUILD_ID__: string;

const BUILD_ID = __BUILD_ID__;
const VERSION = BUILD_ID.split('-')[0]!;
const PORT = DEFAULT_PORT;
const URL = `http://127.0.0.1:${PORT}`;
const RUNTIME_ROOT = path.join(paths.data, 'runtime');
const RUNTIME_DIR = path.join(RUNTIME_ROOT, BUILD_ID);
const LOG_DIR = paths.logs;
const INSTALL_DIR = path.join(paths.localAppData, 'Programs', 'ProductFinderSV');
const INSTALLED_EXE = path.join(INSTALL_DIR, 'ProductFinderSV.exe');
const START_MENU_SHORTCUT = path.join(
  process.env.APPDATA ?? path.join(paths.localAppData, '..', 'Roaming'),
  'Microsoft\\Windows\\Start Menu\\Programs\\ProductFinderSV.lnk',
);
const EDGE_EXES = EDGE_DIRS.map((dir) => path.join(dir, 'msedge.exe'));

function log(msg: string): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'launcher.log'), `${new Date().toISOString()} [${process.pid}] ${msg}\n`);
  } catch {
    // sin log no es grave
  }
}

/** Cuadro de diálogo de Windows (el .exe no tiene consola). Devuelve el botón elegido ("OK", "Yes"…). */
function messageBox(text: string, buttons: MessageBoxButtons, icon: MessageBoxIcon): string {
  const r = spawnSync('powershell.exe', powershellArgs(messageBoxScript(text, buttons, icon)), { windowsHide: true });
  return r.stdout?.toString().trim() ?? '';
}

function showError(message: string): void {
  log(`ERROR: ${message}`);
  messageBox(message, 'OK', 'Error');
}

/** Versión del servicio que responde en el puerto, o null si no hay ninguno nuestro. */
async function probe(): Promise<string | null> {
  try {
    const res = await fetch(`${URL}/api/status`, { signal: AbortSignal.timeout(1500) });
    return res.headers.get(VERSION_HEADER);
  } catch {
    return null;
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(500);
  }
  return false;
}

// ---- Modo servicio ------------------------------------------------------------------

/**
 * Formato de payload.bin: [uint32 LE largo del índice][índice JSON][datos].
 * Índice: [{ p: ruta relativa, o: offset, n: bytes comprimidos }] (cada archivo en gzip).
 */
function extractRuntime(): void {
  if (fs.existsSync(path.join(RUNTIME_DIR, '.complete'))) return;
  log(`extrayendo la app en ${RUNTIME_DIR}`);
  const payload = Buffer.from(getAsset('payload.bin'));
  const indexLen = payload.readUInt32LE(0);
  const index = JSON.parse(payload.subarray(4, 4 + indexLen).toString('utf8')) as { p: string; o: number; n: number }[];
  const dataStart = 4 + indexLen;

  const tmp = `${RUNTIME_DIR}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of index) {
    const out = path.join(tmp, f.p);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zlib.gunzipSync(payload.subarray(dataStart + f.o, dataStart + f.o + f.n)));
  }
  fs.writeFileSync(path.join(tmp, '.complete'), BUILD_ID);
  fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
  fs.renameSync(tmp, RUNTIME_DIR);

  // Limpiar versiones anteriores.
  for (const dir of fs.readdirSync(RUNTIME_ROOT)) {
    if (dir !== BUILD_ID) fs.rmSync(path.join(RUNTIME_ROOT, dir), { recursive: true, force: true });
  }
}

/** --server: supervisor del servicio. Termina cuando el servicio se cierra a propósito. */
async function runSupervisor(): Promise<void> {
  extractRuntime();
  const since = new Date().toISOString();
  const supervisor = new Supervisor({
    spawnWorker: ({ restarts }) => {
      const child = spawn(process.execPath, ['--worker'], {
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, PFSV_SERVICE_SINCE: since, PFSV_SERVICE_RESTARTS: String(restarts) },
      });
      log(`servicio iniciado (proceso ${child.pid})`);
      return {
        kill: () => void child.kill(),
        onExit: (cb) => {
          // 'error' (no se pudo lanzar) también cuenta como caída, para reintentar.
          let reported = false;
          const report = (code: number | null) => {
            if (!reported) cb(code);
            reported = true;
          };
          child.once('exit', (code) => report(code));
          child.once('error', (err) => {
            log(`no se pudo lanzar el servicio: ${String(err)}`);
            report(null);
          });
        },
      };
    },
    probe: async () => (await probe()) !== null,
    log: (msg) => log(`[supervisor] ${msg}`),
  });
  const code = await supervisor.run();
  process.exit(code === EXIT_CODES.alreadyRunning ? 0 : code);
}

/** --worker: el servicio (lo lanza el supervisor, que ya extrajo la app). */
async function runWorker(): Promise<void> {
  // Un error no controlado deja el proceso en un estado dudoso: mejor terminar y que el
  // supervisor lo reinicie limpio.
  process.on('uncaughtException', (err) => {
    log(`uncaughtException: ${err.stack ?? err}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => log(`unhandledRejection: ${String(err)}`));
  process.env.PFSV_VERSION = BUILD_ID;
  const runtimeRequire = createRequire(path.join(RUNTIME_DIR, 'server.cjs'));
  const { startServer } = runtimeRequire('./server.cjs') as typeof import('../../server/src/server.js');
  try {
    await startServer({
      port: PORT,
      webDir: path.join(RUNTIME_DIR, 'web'),
      logFile: path.join(LOG_DIR, 'server.log'),
      desktopExe: process.execPath,
      service: {
        since: process.env.PFSV_SERVICE_SINCE ?? new Date().toISOString(),
        restarts: Number(process.env.PFSV_SERVICE_RESTARTS ?? 0),
      },
    });
    log(`servicio ${BUILD_ID} escuchando en ${URL}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      log('el puerto ya está en uso; otra instancia está corriendo');
      process.exit(EXIT_CODES.alreadyRunning);
    }
    log(`el servicio no pudo arrancar: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
  }
}

// ---- Modo lanzador ------------------------------------------------------------------

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Accesos directos, enlace productfindersv:// y entrada en Configuración → Aplicaciones. */
function registerApp(target: string): void {
  const r = spawnSync('powershell.exe', powershellArgs(registerScript({ exePath: target, version: VERSION })), {
    windowsHide: true,
  });
  if (r.status !== 0) log(`registro incompleto en Windows: ${r.stderr?.toString().trim()}`);
}

/**
 * Al actualizar, el servicio anterior acaba de cerrar el puerto pero sus procesos pueden tardar
 * un momento en soltar el .exe instalado: se reintenta la copia unos segundos.
 */
async function copyWithRetry(src: string, dest: string, attempts = 10): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      fs.copyFileSync(src, dest);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1000);
    }
  }
}

/** Copia el .exe a la carpeta de programas del usuario (instalación sin permisos de administrador). */
async function installSelf(): Promise<string> {
  const current = process.execPath;
  if (samePath(current, INSTALLED_EXE)) return current;
  try {
    let installedBuild: string | null = null;
    try {
      installedBuild = fs.readFileSync(path.join(INSTALL_DIR, 'version.txt'), 'utf8').trim();
    } catch {
      // primera instalación
    }
    const copy = installedBuild !== BUILD_ID || !fs.existsSync(INSTALLED_EXE);
    if (copy) {
      fs.mkdirSync(INSTALL_DIR, { recursive: true });
      await copyWithRetry(current, INSTALLED_EXE);
      fs.writeFileSync(path.join(INSTALL_DIR, 'version.txt'), BUILD_ID);
      log(`instalado ${BUILD_ID} en ${INSTALL_DIR}`);
    }
    // PowerShell tarda ~1 s: solo al instalar o si el usuario borró el acceso del menú Inicio.
    if (copy || !fs.existsSync(START_MENU_SHORTCUT)) registerApp(INSTALLED_EXE);
  } catch (err) {
    // Por ejemplo, si el .exe instalado está en uso: se usa el actual sin instalar.
    log(`no se pudo instalar: ${String(err)}`);
    return current;
  }
  return INSTALLED_EXE;
}

function openWindow(route = 'inicio'): void {
  const url = `${URL}/#/${route}`;
  const edge = EDGE_EXES.find((p) => fs.existsSync(p));
  if (edge) {
    // Modo aplicación: ventana propia, sin barra de direcciones ni pestañas.
    spawn(edge, [`--app=${url}`, '--window-size=1360,900'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}

/** Pide al servicio en ejecución que se cierre y espera a que libere el puerto. */
async function stopRunningService(): Promise<void> {
  await fetch(`${URL}/api/system/shutdown`, { method: 'POST' }).catch(() => {});
  await waitFor(async () => (await probe()) === null, 15_000);
}

async function launch(opts: { window: boolean; route?: string }): Promise<void> {
  let running = await probe();

  // Otra versión en ejecución (p. ej. tras descargar una actualización): cerrarla primero.
  if (running && running !== BUILD_ID && running !== 'dev') {
    log(`cerrando la versión en ejecución ${running}`);
    await stopRunningService();
    running = null;
  }

  if (!running) {
    const exe = await installSelf();
    log(`iniciando el servicio con ${exe}`);
    spawn(exe, ['--server'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    // La primera vez tarda más: extrae la app (~15 MB).
    const ok = await waitFor(async () => (await probe()) !== null, 60_000);
    if (!ok) {
      const message =
        `No se pudo iniciar ProductFinderSV. Revisa que nada más use el puerto ${PORT}.\n\nRegistro: ` +
        path.join(LOG_DIR, 'launcher.log');
      // Al iniciar Windows no se interrumpe al usuario con un diálogo: queda en el registro.
      if (opts.window) showError(message);
      else log(`ERROR: ${message}`);
      process.exit(1);
    }
  }
  if (opts.window) openWindow(opts.route);
}

// ---- Desinstalación -----------------------------------------------------------------

async function uninstall(): Promise<void> {
  const confirm = messageBox(
    '¿Desinstalar ProductFinderSV?\n\nSe cerrará, dejará de buscar y se quitarán sus accesos directos.',
    'YesNo',
    'Question',
  );
  if (confirm !== 'Yes') return;
  const removeData =
    messageBox(
      '¿Borrar también tus datos?\n\nIncluye tus búsquedas, los resultados guardados y la sesión de Facebook de la app. ' +
        'Si piensas volver a instalarlo, elige No.',
      'YesNo',
      'Question',
    ) === 'Yes';

  log(`desinstalando (borrar datos: ${removeData})`);
  if (await probe()) await stopRunningService();

  spawnSync('powershell.exe', powershellArgs(unregisterScript()), { windowsHide: true });
  // El .exe en uso (este desinstalador y el servicio que se está cerrando) no se puede borrar:
  // un PowerShell aparte espera a que terminen todos y luego borra.
  // Sin borrar datos se quita igual la copia extraída de la app (runtime), que no es del usuario.
  const targets = [INSTALL_DIR, removeData ? paths.data : RUNTIME_ROOT];
  spawnPowerShell(cleanupScript({ exePath: process.execPath, targets }), { detached: true }).unref();

  messageBox(
    removeData
      ? 'ProductFinderSV se desinstaló junto con tus datos.'
      : `ProductFinderSV se desinstaló. Tus búsquedas se conservan en ${paths.data} por si lo vuelves a instalar.`,
    'OK',
    'Information',
  );
}

// ---- Entrada --------------------------------------------------------------------------

const args = process.argv.slice(1);
const main = args.includes('--worker')
  ? runWorker
  : args.includes('--server')
    ? runSupervisor
    : args.includes('--uninstall')
    ? uninstall
      : args.includes('--background')
        ? () => launch({ window: false })
        : () =>
            launch({ window: true, route: args.includes('--open') ? routeFromLink(args[args.indexOf('--open') + 1]) : undefined });

main().catch((err) => {
  const message = `Error inesperado: ${err instanceof Error ? err.message : String(err)}`;
  // El servicio no muestra cuadros de diálogo (puede estar arrancando con Windows): solo registra.
  if (args.includes('--worker')) log(message);
  else showError(message);
  process.exit(1);
});
