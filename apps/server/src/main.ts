import path from 'node:path';
import { startServer } from './server.js';

// Modo desarrollo (`npm run start`): logs en consola y panel desde apps/web/dist.
const server = await startServer({
  port: Number(process.env.PFSV_PORT ?? 8787),
  webDir: process.env.PFSV_WEB_DIR ?? path.resolve(import.meta.dirname, '../../web/dist'),
});

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
