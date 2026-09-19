import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { SearchEntityType } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { searchWorldLore } from '../lib/search-index.js';

const searchQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
  q: z.string().trim().min(1).max(120),
  type: z.enum([SearchEntityType.WORLD, SearchEntityType.LORE_ENTRY]).optional(),
  worldId: z.string().trim().min(1).optional(),
});

type RegisterSearchRoutesOptions = {
  database?: typeof prisma;
};

export async function registerSearchRoutes(
  app: FastifyInstance,
  options: RegisterSearchRoutesOptions = {},
) {
  const database = options.database ?? prisma;

  app.get('/search', async (request, reply) => {
    const query = searchQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({
        code: 'INVALID_SEARCH_QUERY',
        error: 'Invalid search query.',
      });
    }

    try {
      return await searchWorldLore(database, query.data);
    } catch (error) {
      return reply.code(400).send({
        code: 'INVALID_SEARCH_QUERY',
        error: error instanceof Error ? error.message : 'Invalid search query.',
      });
    }
  });
}
