import { execFile } from 'node:child_process';

// Solo módulos nativos de Node: el lanzador del ejecutable también importa este archivo.

/**
 * Inicio automático con Windows: un valor en la clave "Run" del usuario. Arranca el servicio
 * al iniciar sesión, en la sesión del usuario (puede abrir Edge y mostrar avisos) y sin
 * permisos de administrador, a diferencia de un servicio de Windows o una tarea programada.
 */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'ProductFinderSV';

export interface Autostart {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

function reg(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 10_000 }, (err, stdout) =>
      resolve({ ok: !err, stdout: stdout.toString() }),
    );
  });
}

/** Comando que se registra: el .exe instalado en modo segundo plano (sin abrir la ventana). */
export const autostartCommand = (exePath: string) => `"${exePath}" --background`;

export function createAutostart(exePath: string): Autostart {
  const isEnabled = async () => {
    const { ok, stdout } = await reg(['query', RUN_KEY, '/v', VALUE_NAME]);
    return ok && stdout.includes(VALUE_NAME);
  };
  return {
    isEnabled,
    async setEnabled(enabled) {
      const r = enabled
        ? await reg(['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', autostartCommand(exePath), '/f'])
        : await reg(['delete', RUN_KEY, '/v', VALUE_NAME, '/f']);
      // Borrar un valor que no existe también "falla"; lo que importa es el estado final.
      if (!r.ok && (await isEnabled()) !== enabled) {
        throw new Error('No se pudo cambiar el inicio automático con Windows');
      }
    },
  };
}
