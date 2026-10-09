/**
 * ProductFinderSV.exe — punto de entrada del ejecutable (Node SEA).
 *
 * Doble clic (modo lanzador):
 *   1. Si ya hay un servicio de ProductFinderSV de otra versión, le pide cerrarse.
 *   2. Se copia a %LOCALAPPDATA%\Programs\ProductFinderSV y crea accesos directos.
 *   3. Arranca el servicio en segundo plano (este mismo .exe con --server).
 *   4. Abre el panel en una ventana de aplicación (Edge --app) y termina.
 *
 * --server (modo servicio, sin ventana):
 *   Extrae la app embebida (servidor + panel + Playwright) la primera vez y la ejecuta.
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
import { VERSION_HEADER } from '../../server/src/version.js';

/** Versión + huella del contenido: distingue recompilaciones de la misma versión. */
declare const __BUILD_ID__: string;

const BUILD_ID = __BUILD_ID__;
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

/** Mensaje de error visible (el .exe no tiene consola). */
function showError(message: string): void {
  log(`ERROR: ${message}`);
  const text = message.replace(/'/g, "''");
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${text}', 'ProductFinderSV', 'OK', 'Error') | Out-Null`,
    ],
    { windowsHide: true },
  );
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

async function runServer(): Promise<void> {
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err}`));
  process.on('unhandledRejection', (err) => log(`unhandledRejection: ${String(err)}`));
  extractRuntime();
  process.env.PFSV_VERSION = BUILD_ID;
  const runtimeRequire = createRequire(path.join(RUNTIME_DIR, 'server.cjs'));
  const { startServer } = runtimeRequire('./server.cjs') as typeof import('../../server/src/server.js');
  try {
    await startServer({ port: PORT, webDir: path.join(RUNTIME_DIR, 'web'), logFile: path.join(LOG_DIR, 'server.log') });
    log(`servicio ${BUILD_ID} escuchando en ${URL}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      log('el puerto ya está en uso; otra instancia está corriendo');
      process.exit(0);
    }
    throw err;
  }
}

// ---- Modo lanzador ------------------------------------------------------------------

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function createShortcuts(target: string): void {
  const ps = `
$ws = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
foreach ($d in $dirs) {
  $s = $ws.CreateShortcut((Join-Path $d 'ProductFinderSV.lnk'))
  $s.TargetPath = '${target.replace(/'/g, "''")}'
  $s.WorkingDirectory = '${path.dirname(target).replace(/'/g, "''")}'
  $s.Description = 'ProductFinderSV - buscador automático de Facebook Marketplace'
  $s.IconLocation = '${target.replace(/'/g, "''")},0'
  $s.Save()
}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
  if (r.status !== 0) log(`no se pudieron crear los accesos directos: ${r.stderr?.toString()}`);
}

/** Copia el .exe a la carpeta de programas del usuario (instalación sin permisos de administrador). */
function installSelf(): string {
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
      fs.copyFileSync(current, INSTALLED_EXE);
      fs.writeFileSync(path.join(INSTALL_DIR, 'version.txt'), BUILD_ID);
      log(`instalado ${BUILD_ID} en ${INSTALL_DIR}`);
    }
    // PowerShell tarda ~1 s: solo al instalar o si el usuario borró el acceso del menú Inicio.
    if (copy || !fs.existsSync(START_MENU_SHORTCUT)) createShortcuts(INSTALLED_EXE);
    return INSTALLED_EXE;
  } catch (err) {
    // Por ejemplo, si el .exe instalado está en uso: se usa el actual sin instalar.
    log(`no se pudo instalar: ${String(err)}`);
    return current;
  }
}

function openWindow(): void {
  const edge = EDGE_EXES.find((p) => fs.existsSync(p));
  if (edge) {
    // Modo aplicación: ventana propia, sin barra de direcciones ni pestañas.
    spawn(edge, [`--app=${URL}/#/inicio`, '--window-size=1360,900'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('cmd.exe', ['/c', 'start', '', `${URL}/#/inicio`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}

async function launch(): Promise<void> {
  let running = await probe();

  // Otra versión en ejecución (p. ej. tras descargar una actualización): cerrarla primero.
  if (running && running !== BUILD_ID && running !== 'dev') {
    log(`cerrando la versión en ejecución ${running}`);
    await fetch(`${URL}/api/system/shutdown`, { method: 'POST' }).catch(() => {});
    await waitFor(async () => (await probe()) === null, 15_000);
    running = null;
  }

  if (!running) {
    const exe = installSelf();
    log(`iniciando el servicio con ${exe}`);
    spawn(exe, ['--server'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    // La primera vez tarda más: extrae la app (~15 MB).
    const ok = await waitFor(async () => (await probe()) !== null, 60_000);
    if (!ok) {
      showError(
        `No se pudo iniciar ProductFinderSV. Revisa que nada más use el puerto ${PORT}.\n\nRegistro: ` +
          path.join(LOG_DIR, 'launcher.log'),
      );
      process.exit(1);
    }
  }
  openWindow();
}

const main = process.argv.includes('--server') ? runServer : launch;
main().catch((err) => {
  showError(`Error inesperado: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
