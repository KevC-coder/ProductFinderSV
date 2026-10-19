import type { FastifyInstance } from 'fastify';

/** Nombres de host del propio equipo: el panel, la bandeja y el lanzador usan siempre estos. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const hostnameOf = (hostAndPort: string | undefined): string => {
  try {
    return new URL(`http://${hostAndPort ?? ''}`).hostname;
  } catch {
    return '';
  }
};

/** true si la petición puede venir de una página web ajena (y debe rechazarse). */
export function isForeignRequest(req: { method: string; headers: { host?: string; origin?: string } }): boolean {
  // DNS rebinding: un dominio ajeno que resuelve a 127.0.0.1 llega con su propio Host.
  if (!LOOPBACK.has(hostnameOf(req.headers.host))) return true;
  // CSRF: una web ajena puede enviar peticiones simples (sin preflight) a 127.0.0.1. Las
  // del panel llevan su propio origen; la bandeja y el lanzador no envían Origin.
  const origin = req.headers.origin;
  if (origin !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
    return !LOOPBACK.has(hostnameOf(origin.replace(/^https?:\/\//, '')));
  }
  return false;
}

/**
 * El servidor escucha solo en 127.0.0.1, pero eso no basta: una página web abierta en el
 * navegador puede llegar a 127.0.0.1 con DNS rebinding o enviarle formularios. Sin este
 * filtro podría, por ejemplo, vincular su propio chat de Telegram y recibir tus avisos.
 */
export function registerLocalOnly(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (isForeignRequest(req)) return reply.code(403).send({ error: 'Acceso no permitido' });
  });
}
