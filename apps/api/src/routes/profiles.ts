import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { InvalidHiveUsernameError } from '../lib/hive-username.js';
import { getUserProfile, type UserProfileDatabase } from '../lib/user-profiles.js';

const profileParamsSchema = z.object({
  username: z.string().min(1).max(64),
});

type RegisterProfileRoutesOptions = {
  database?: UserProfileDatabase;
};

export async function registerProfileRoutes(
  app: FastifyInstance,
  options: RegisterProfileRoutesOptions = {},
) {
  const database =
    options.database ?? ((await import('../lib/prisma.js')).prisma as UserProfileDatabase);

  app.get('/profiles/:username', async (request, reply) => {
    const params = profileParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: 'Invalid profile route.',
      });
    }

    try {
      const profile = await getUserProfile(database, params.data.username);

      if (!profile) {
        return reply.code(404).send({
          error: 'Profile not found.',
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof InvalidHiveUsernameError) {
        return reply.code(400).send({
          error: 'Invalid Hive username.',
        });
      }

      throw error;
    }
  });
}
