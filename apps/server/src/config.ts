import os from 'node:os';
import path from 'node:path';

// Solo módulos nativos de Node: el lanzador del ejecutable también importa este archivo.

const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');

/** Carpeta de datos del usuario. Se puede cambiar con PFSV_DATA_DIR (útil para desarrollo). */
const dataDir = process.env.PFSV_DATA_DIR ?? path.join(localAppData, 'productFindersv');

export const paths = {
  localAppData,
  data: dataDir,
  browserProfile: path.join(dataDir, 'browser-profile'),
  logs: path.join(dataDir, 'logs'),
  debug: path.join(dataDir, 'debug'),
};

export const DEFAULT_PORT = 8787;

/** Carpetas de instalación de Microsoft Edge (viene con Windows 10/11). */
export const EDGE_DIRS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
  'C:\\Program Files\\Microsoft\\Edge\\Application',
];

export const defaults = {
  currency: 'USD',
  locale: 'es-SV',
  timezone: 'America/El_Salvador',
};
