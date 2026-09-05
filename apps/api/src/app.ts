import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { createPrismaRateLimitStore } from './lib/auth-rate-limit-store.js';
import { reportUnhandledError } from './lib/error-tracking.js';
import { createHafClient } from './lib/hive/client.js';
import { prisma } from './lib/prisma.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContributionRoutes } from './routes/contributions.js';
import { registerHealthRoute } from './routes/health.js';
import { registerLoreRoutes } from './routes/lore.js';
import { registerProposalRoutes } from './routes/proposals.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerWorldRoutes } from './routes/worlds.js';

export async function buildApp() {
  const app = Fastify({
    genReqId: () => randomUUID(),
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
    requestIdHeader: 'x-request-id',
    trustProxy: env.TRUST_PROXY,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onError', async (request, _reply, error) => {
    await reportUnhandledError(
      {
        error,
        method: request.method,
        requestId: request.id,
        url: request.url,
      },
      {
        enabled: env.ERROR_TRACKING_ENABLED,
        logger: request.log,
        webhookUrl: env.ERROR_TRACKING_WEBHOOK_URL,
      },
    );
  });

  await app.register(cors, {
    credentials: true,
    origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN : [env.CORS_ORIGIN],
  });
  await app.register(rateLimit, {
    global: false,
    skipOnError: false,
    // Route scope already isolates /auth/refresh from /auth/challenge inside this shared
    // namespace. A separate namespace is only warranted for independent cleanup, retention,
    // or monitoring.
    store: createPrismaRateLimitStore(prisma),
  });

  await registerHealthRoute(app, {
    database: prisma,
    getHeadBlock: () => createHafClient().getHeadBlock(),
    indexerLagThresholdBlocks: env.INDEXER_MAX_READY_LAG_BLOCKS,
    indexerName: env.INDEXER_NAME,
  });
  await registerAuthRoutes(app);
  await registerWorldRoutes(app);
  await registerLoreRoutes(app);
  await registerContributionRoutes(app);
  await registerProposalRoutes(app);
  await registerProfileRoutes(app);

  return app;
}
