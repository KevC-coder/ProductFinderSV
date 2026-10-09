import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cleanupScript, messageBoxScript, registerScript, unregisterScript } from '../src/desktop/install-scripts.js';
import { trayScript } from '../src/desktop/tray.js';
import { toastScript, toastXml } from '../src/notifier/windows-toast.js';

/**
 * Los scripts de PowerShell solo corren en Windows, pero su sintaxis se puede revisar en
 * cualquier sistema con PowerShell (pwsh viene en los runners de GitHub Actions). Sin
 * PowerShell instalado el test se omite.
 */
function findPowerShell(): string | null {
  for (const bin of ['pwsh', 'powershell.exe']) {
    if (spawnSync(bin, ['-NoProfile', '-Command', 'exit 0']).status === 0) return bin;
  }
  return null;
}

const powershell = findPowerShell();

// Rutas y textos con comillas, acentos y espacios: los casos que rompen un script mal armado.
const exe = "C:\\Users\\Ana María O'Neil\\AppData\\Local\\Programs\\ProductFinderSV\\ProductFinderSV.exe";
const scripts: Record<string, string> = {
  tray: trayScript({ exePath: exe, port: 8787, parentPid: 1234 }),
  toast: toastScript(
    toastXml({ title: 'iPhone 13: 2 resultados nuevos', lines: ['$250 · Apple’s "Pro" <128GB>'], route: 'resultados?watcher=1' }, 'productfindersv://resultados?watcher=1'),
    "C:\\Users\\O'Neil\\icon-192.png",
  ),
  toastSinIcono: toastScript(toastXml({ title: 't', lines: [], route: 'inicio' }, 'http://127.0.0.1:8787/#/inicio'), null),
  register: registerScript({ exePath: exe, version: '0.2.0' }),
  unregister: unregisterScript(),
  cleanup: cleanupScript([path.win32.dirname(exe), "C:\\Users\\O'Neil\\AppData\\Local\\productFindersv"]),
  messageBox: messageBoxScript('¿Desinstalar ProductFinderSV?\n\nSe cerrará y "dejará" de buscar.', 'YesNo', 'Question'),
};

test('los scripts de PowerShell no tienen errores de sintaxis', { skip: powershell ? false : 'PowerShell no está instalado' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfsv-ps-'));
  try {
    for (const [name, script] of Object.entries(scripts)) fs.writeFileSync(path.join(dir, `${name}.ps1`), script, 'utf8');
    const check = `
$out = @{}
foreach ($f in Get-ChildItem -LiteralPath ${`'${dir.replace(/'/g, "''")}'`} -Filter *.ps1) {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput((Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8), [ref]$null, [ref]$errors)
  $out[$f.BaseName] = @($errors | ForEach-Object { $_.Message + ' (línea ' + $_.Extent.StartLineNumber + ')' })
}
$out | ConvertTo-Json -Compress -Depth 3`;
    const r = spawnSync(powershell!, ['-NoProfile', '-NonInteractive', '-Command', check], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout) as Record<string, string[] | string | null>;
    assert.deepEqual(Object.keys(result).sort(), Object.keys(scripts).sort());
    for (const [name, errors] of Object.entries(result)) {
      // ConvertTo-Json convierte un arreglo de un elemento en un texto.
      const list = errors == null ? [] : Array.isArray(errors) ? errors : [errors];
      assert.deepEqual(list, [], `${name}.ps1`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
