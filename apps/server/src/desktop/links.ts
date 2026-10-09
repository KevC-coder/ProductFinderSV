// Solo módulos nativos de Node: el lanzador del ejecutable también importa este archivo.

/**
 * Enlaces productfindersv://<ruta del panel>. Windows los abre con ProductFinderSV.exe --open
 * (registro hecho por el lanzador); así un clic en un aviso abre la ventana de la app.
 */
export const APP_PROTOCOL = 'productfindersv';

export const appLink = (route: string) => `${APP_PROTOCOL}://${route}`;

/**
 * "productfindersv://resultados?watcher=3" → "resultados?watcher=3". Solo deja pasar rutas
 * con forma de pantalla del panel; cualquier otra cosa abre el inicio.
 */
export function routeFromLink(link: string | undefined): string {
  const m = /^productfindersv:\/*([a-z]+)\/?(\?[\w=&%.-]*)?$/i.exec(link ?? '');
  return m ? `${m[1]!.toLowerCase()}${m[2] ?? ''}` : 'inicio';
}
