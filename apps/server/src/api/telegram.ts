import type { FastifyInstance } from 'fastify';
import { NOTIFY_MODES, type NotifyMode } from '../domain/types.js';
import type { TelegramService } from '../telegram/service.js';

const tokenBody = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: { token: { type: 'string', minLength: 1, maxLength: 200 } },
} as const;

const patchBody = {
  type: 'object',
  required: ['notifyMode'],
  additionalProperties: false,
  properties: { notifyMode: { type: 'string', enum: NOTIFY_MODES } },
} as const;

/**
 * /api/telegram — configurar el bot de Telegram desde Ajustes. El token se recibe pero nunca
 * se devuelve. Los errores de configuración (TelegramSetupError) llevan su código HTTP y un
 * mensaje en español que el manejador global envía tal cual.
 */
export function registerTelegramRoutes(app: FastifyInstance, telegram: TelegramService): void {
  app.get('/api/telegram', async () => telegram.state());

  app.put<{ Body: { token: string } }>('/api/telegram/token', { schema: { body: tokenBody } }, async (req) =>
    telegram.setToken(req.body.token),
  );

  app.post('/api/telegram/link', async () => {
    telegram.startLinking();
    return telegram.state();
  });

  app.patch<{ Body: { notifyMode: NotifyMode } }>('/api/telegram', { schema: { body: patchBody } }, async (req) =>
    telegram.setNotifyMode(req.body.notifyMode),
  );

  app.post('/api/telegram/test', async (_req, reply) => {
    await telegram.sendTest();
    return reply.code(204).send();
  });

  app.delete('/api/telegram', async () => telegram.disconnect());
}
