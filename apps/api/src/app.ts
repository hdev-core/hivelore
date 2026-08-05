import cors from '@fastify/cors';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoute } from './routes/health.js';
import { registerWorldRoutes } from './routes/worlds.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'request.headers.authorization',
        'request.headers.cookie',
        'body.signature',
        'body.refreshToken',
        'body.nonce',
        'body.code',
        'body.id_token',
        'body.access_token',
        'body.refresh_token',
      ],
    },
  });

  await app.register(cors, {
    credentials: true,
    origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN : [env.CORS_ORIGIN],
  });

  await registerHealthRoute(app);
  await registerAuthRoutes(app);
  await registerWorldRoutes(app);

  return app;
}
