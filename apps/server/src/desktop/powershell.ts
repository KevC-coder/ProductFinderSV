import { execFile, spawn, type ChildProcess } from 'node:child_process';

// Solo módulos nativos de Node: el lanzador del ejecutable también importa este archivo.

/**
 * Literal de PowerShell entre comillas simples. Además de ' hay que duplicar las comillas
 * tipográficas (‘ ’ ‚ ‛), que PowerShell también trata como comilla simple; aparecen en
 * títulos de Facebook ("Apple’s…") y romperían el script.
 */
export const psString = (value: string): string => `'${value.replace(/['‘’‚‛]/g, '$&$&')}'`;

/**
 * Argumentos para ejecutar un script. -EncodedCommand (UTF-16 en base64) evita los problemas
 * de comillas de -Command y conserva acentos y caracteres especiales.
 */
export function powershellArgs(script: string): string[] {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ];
}

/** Ejecuta un script corto y espera a que termine. Devuelve lo que escribió en la salida. */
export function runPowerShell(script: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      powershellArgs(script),
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.toString().trim() || err.message));
        else resolve(stdout.toString());
      },
    );
  });
}

/** Lanza un script de larga duración (p. ej. el icono de la bandeja) sin ventana. */
export function spawnPowerShell(script: string, opts: { detached?: boolean } = {}): ChildProcess {
  return spawn('powershell.exe', powershellArgs(script), {
    windowsHide: true,
    stdio: 'ignore',
    detached: opts.detached ?? false,
  });
}
