import path from 'node:path';
import { APP_PROTOCOL } from './links.js';
import { psString } from './powershell.js';

// Solo módulos nativos de Node: el lanzador del ejecutable importa este archivo.

/**
 * Scripts de PowerShell del lanzador para instalar, registrar y desinstalar la app en Windows.
 * Todo vive en HKCU y en carpetas del usuario: nada requiere permisos de administrador.
 */

/** Nombre con el que Windows muestra los avisos (ver notifier/windows-toast.ts). */
export const APP_USER_MODEL_ID = 'ProductFinderSV';

const SHORTCUT_DIRS = "@([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))";
const PROTOCOL_KEY = `HKCU:\\Software\\Classes\\${APP_PROTOCOL}`;
const UNINSTALL_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ProductFinderSV';
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUMID_KEY = `HKCU:\\Software\\Classes\\AppUserModelId\\${APP_USER_MODEL_ID}`;

/**
 * Accesos directos (escritorio y menú Inicio), enlace productfindersv:// (los avisos de Windows
 * abren la app con él) y entrada en Configuración → Aplicaciones para poder desinstalar.
 * Cada parte es independiente: si una falla, las demás se hacen igual (y sale con código 1).
 */
export function registerScript(opts: { exePath: string; version: string }): string {
  const dir = psString(path.win32.dirname(opts.exePath));
  return `
$ErrorActionPreference = 'Stop'
$exe = ${psString(opts.exePath)}
$failed = $false

function Set-Key([string]$path, [hashtable]$values) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  foreach ($name in $values.Keys) {
    $v = $values[$name]
    if ($name -eq '') { Set-Item -Path $path -Value $v; continue }
    $type = if ($v -is [int]) { 'DWord' } else { 'String' }
    New-ItemProperty -Path $path -Name $name -Value $v -PropertyType $type -Force | Out-Null
  }
}

try {
  $ws = New-Object -ComObject WScript.Shell
  foreach ($d in ${SHORTCUT_DIRS}) {
    $s = $ws.CreateShortcut((Join-Path $d 'ProductFinderSV.lnk'))
    $s.TargetPath = $exe
    $s.WorkingDirectory = ${dir}
    $s.Description = 'ProductFinderSV - buscador automático de Facebook Marketplace'
    $s.IconLocation = $exe + ',0'
    $s.Save()
  }
} catch { [Console]::Error.WriteLine("accesos directos: $_"); $failed = $true }

try {
  Set-Key '${PROTOCOL_KEY}' @{ '' = 'URL:ProductFinderSV'; 'URL Protocol' = '' }
  Set-Key '${PROTOCOL_KEY}\\DefaultIcon' @{ '' = ($exe + ',0') }
  Set-Key '${PROTOCOL_KEY}\\shell\\open\\command' @{ '' = ('"' + $exe + '" --open "%1"') }
} catch { [Console]::Error.WriteLine("enlace ${APP_PROTOCOL}: $_"); $failed = $true }

try {
  Set-Key '${UNINSTALL_KEY}' @{
    DisplayName = 'ProductFinderSV'
    DisplayVersion = ${psString(opts.version)}
    Publisher = 'ProductFinderSV'
    DisplayIcon = ($exe + ',0')
    InstallLocation = ${dir}
    UninstallString = ('"' + $exe + '" --uninstall')
    NoModify = 1
    NoRepair = 1
  }
} catch { [Console]::Error.WriteLine("aplicaciones instaladas: $_"); $failed = $true }

if ($failed) { exit 1 }
`;
}

/** Quita accesos directos, inicio con Windows, enlace, identidad de avisos y entrada de desinstalación. */
export function unregisterScript(): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
foreach ($d in ${SHORTCUT_DIRS}) { Remove-Item -LiteralPath (Join-Path $d 'ProductFinderSV.lnk') -Force }
Remove-ItemProperty -Path '${RUN_KEY}' -Name 'ProductFinderSV'
Remove-Item -Path '${PROTOCOL_KEY}' -Recurse -Force
Remove-Item -Path '${AUMID_KEY}' -Recurse -Force
Remove-Item -Path '${UNINSTALL_KEY}' -Recurse -Force
`;
}

/** Borra carpetas tras una pausa (el .exe en uso no puede borrarse a sí mismo mientras corre). */
export function cleanupScript(targets: string[]): string {
  return `
Start-Sleep -Seconds 3
foreach ($t in @(${targets.map(psString).join(', ')})) { Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue }
`;
}

export type MessageBoxButtons = 'OK' | 'YesNo';
export type MessageBoxIcon = 'Error' | 'Information' | 'Question' | 'Warning';

/** Cuadro de diálogo; escribe en la salida el botón elegido ("OK", "Yes", "No"). */
export function messageBoxScript(text: string, buttons: MessageBoxButtons, icon: MessageBoxIcon): string {
  return (
    'Add-Type -AssemblyName PresentationFramework\n' +
    `[System.Windows.MessageBox]::Show(${psString(text)}, 'ProductFinderSV', '${buttons}', '${icon}')`
  );
}
