/** Versión de la app. El ejecutable de escritorio la define al arrancar; en desarrollo vale "dev". */
export const APP_VERSION = process.env.PFSV_VERSION ?? 'dev';

/** Cabecera con la que el lanzador reconoce que el puerto lo ocupa ProductFinderSV (y su versión). */
export const VERSION_HEADER = 'x-productfindersv';
