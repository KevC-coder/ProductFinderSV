import type { FastifyInstance } from 'fastify';
import type { Bot, BotEvents } from '../scheduler/bot.js';

const FORWARDED: (keyof BotEvents)[] = ['run:started', 'run:finished', 'session:changed'];

/**
 * GET /api/events — Server-Sent Events para que el panel se actualice en vivo
 * (corrida iniciada/terminada, cambios de sesión) sin tener que recargar.
 */
export function registerEvents(app: FastifyInstance, bot: Bot): void {
  app.get('/api/events', (_req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');

    /** Reenvía un evento del bot al panel; devuelve la función para dejar de escucharlo. */
    const forward = (event: keyof BotEvents) => {
      const listener = (data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      bot.on(event, listener);
      return () => void bot.off(event, listener);
    };
    const unsubscribes = FORWARDED.map(forward);
    // Comentario periódico para que la conexión no se cierre por inactividad.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

    res.on('close', () => {
      clearInterval(keepAlive);
      for (const off of unsubscribes) off();
    });
  });
}
