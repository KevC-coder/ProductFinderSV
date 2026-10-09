/**
 * Construye release/ProductFinderSV.exe: un único ejecutable con Node, el servidor, el panel
 * y Playwright embebidos (Node Single Executable Application).
 *
 *   npm run package        (desde la raíz; compila el panel antes)
 *
 * Pasos: bundle del servidor → payload.bin → launcher.cjs → blob SEA → copia de node.exe →
 * icono y versión → inyección del blob → subsistema GUI (sin ventana de consola).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { build } from 'esbuild';
import { inject } from 'postject';
import * as ResEdit from 'resedit';

const root = path.resolve(import.meta.dirname, '../../..');
const desktop = path.join(root, 'apps/desktop');
const buildDir = path.join(desktop, 'build');
const payloadDir = path.join(buildDir, 'payload');
const releaseDir = path.join(root, 'release');
const exePath = path.join(releaseDir, 'ProductFinderSV.exe');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const step = (msg) => console.log(`\n▸ ${msg}`);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

if (process.platform !== 'win32') throw new Error('El ejecutable se construye en Windows.');
const webDist = path.join(root, 'apps/web/dist');
if (!fs.existsSync(path.join(webDist, 'index.html'))) throw new Error('Falta apps/web/dist: ejecuta "npm run build" antes.');

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(payloadDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

// 1. Servidor en un solo archivo CommonJS. Playwright va aparte: necesita sus archivos reales.
step('Empaquetando el servidor');
await build({
  entryPoints: [path.join(root, 'apps/server/src/server.ts')],
  outfile: path.join(payloadDir, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['playwright-core'],
  legalComments: 'none',
  logLevel: 'warning',
});

// 2. Panel compilado y Playwright.
step('Copiando el panel y Playwright');
fs.cpSync(webDist, path.join(payloadDir, 'web'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules/playwright-core'), path.join(payloadDir, 'node_modules/playwright-core'), {
  recursive: true,
});

// 3. payload.bin: índice JSON + archivos en gzip (ver extractRuntime en launcher.ts).
step('Generando payload.bin');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
})(payloadDir);
const index = [];
const chunks = [];
let offset = 0;
for (const file of files) {
  const data = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
  index.push({ p: path.relative(payloadDir, file).split(path.sep).join('/'), o: offset, n: data.length });
  chunks.push(data);
  offset += data.length;
}
const indexBuf = Buffer.from(JSON.stringify(index));
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(indexBuf.length);
const payloadBin = path.join(buildDir, 'payload.bin');
const payload = Buffer.concat([lenBuf, indexBuf, ...chunks]);
fs.writeFileSync(payloadBin, payload);
// Identificador de compilación: versión + huella del contenido. Así, aunque se recompile con
// la misma versión, el ejecutable reinstala y vuelve a extraer la app actualizada.
const buildId = `${version}-${createHash('sha256').update(payload).digest('hex').slice(0, 8)}`;
console.log(`  ${files.length} archivos, ${mb(payload.length)} · compilación ${buildId}`);

// 4. Lanzador.
step('Empaquetando el lanzador');
await build({
  entryPoints: [path.join(desktop, 'src/launcher.ts')],
  outfile: path.join(buildDir, 'launcher.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  logLevel: 'warning',
});

// 5. Blob SEA.
step('Generando el blob SEA');
const seaConfig = path.join(buildDir, 'sea-config.json');
fs.writeFileSync(
  seaConfig,
  JSON.stringify({
    main: path.join(buildDir, 'launcher.cjs'),
    output: path.join(buildDir, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: { 'payload.bin': payloadBin },
  }),
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

// 6. Copia de node.exe con la app inyectada. (postject antes que resedit: al revés, postject
// no puede leer las relocaciones del binario reescrito.)
step('Inyectando la app en el ejecutable');
fs.copyFileSync(process.execPath, exePath);
const sizeBefore = fs.statSync(exePath).size;
await inject(exePath, 'NODE_SEA_BLOB', fs.readFileSync(path.join(buildDir, 'sea-prep.blob')), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  overwrite: true,
});
if (fs.statSync(exePath).size <= sizeBefore) throw new Error('postject no inyectó la app en el ejecutable');

// 7. Icono y datos de versión de ProductFinderSV (resedit conserva el recurso inyectado).
step('Aplicando icono y versión');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(desktop, 'assets/app.ico')));
for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    group.id,
    group.lang,
    icon.icons.map((i) => i.data),
  );
}
const [major, minor, patch] = version.split('.').map(Number);
for (const vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)) {
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, {
      ProductName: 'ProductFinderSV',
      FileDescription: 'ProductFinderSV',
      CompanyName: 'ProductFinderSV',
      InternalName: 'ProductFinderSV',
      OriginalFilename: 'ProductFinderSV.exe',
      LegalCopyright: '',
      ProductVersion: version,
      FileVersion: version,
    });
  }
  vi.setFileVersion(major, minor, patch, 0);
  vi.setProductVersion(major, minor, patch, 0);
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
const hasBlob = ResEdit.NtExecutableResource.from(
  ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true }),
).entries.some((e) => String(e.id).toUpperCase() === 'NODE_SEA_BLOB');
if (!hasBlob) throw new Error('El recurso NODE_SEA_BLOB se perdió al aplicar el icono');

// 8. Subsistema GUI: al hacer doble clic no aparece una ventana de consola.
step('Marcando como aplicación de ventana (sin consola)');
const bin = fs.readFileSync(exePath);
const peOffset = bin.readUInt32LE(0x3c);
if (bin.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Cabecera PE no válida');
const subsystemOffset = peOffset + 24 + 68; // cabecera opcional + campo Subsystem
bin.writeUInt16LE(2, subsystemOffset); // IMAGE_SUBSYSTEM_WINDOWS_GUI
fs.writeFileSync(exePath, bin);

console.log(`\n✔ ${path.relative(root, exePath)} (${mb(fs.statSync(exePath).size)}) — compilación ${buildId}`);
