import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { WorldRole } from '../src/generated/prisma/enums.js';
import { ensureActiveFounderMembership } from '../src/lib/founder-memberships.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the development seed.');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed while NODE_ENV=production.');
}

if (databaseUrl.includes('PROD') || databaseUrl.includes('production')) {
  throw new Error('Refusing to seed a database URL that looks production-like.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
});

async function main() {
  const founder = await prisma.user.upsert({
    where: { normalizedHiveUsername: 'emberquill.dev' },
    update: {
      displayName: 'Ember Quill',
      bio: 'Fictional development founder profile.',
    },
    create: {
      hiveUsername: 'emberquill.dev',
      normalizedHiveUsername: 'emberquill.dev',
      displayName: 'Ember Quill',
      bio: 'Fictional development founder profile.',
    },
  });

  const contributor = await prisma.user.upsert({
    where: { normalizedHiveUsername: 'mira-vale.dev' },
    update: {
      displayName: 'Mira Vale',
      bio: 'Fictional development contributor profile.',
    },
    create: {
      hiveUsername: 'mira-vale.dev',
      normalizedHiveUsername: 'mira-vale.dev',
      displayName: 'Mira Vale',
      bio: 'Fictional development contributor profile.',
    },
  });

  const world = await prisma.world.upsert({
    where: { slug: 'glass-archipelago' },
    update: {
      title: 'Glass Archipelago',
      description:
        'A fictional chain of floating islands where memory, weather, and craft are tightly intertwined.',
    },
    create: {
      slug: 'glass-archipelago',
      title: 'Glass Archipelago',
      description:
        'A fictional chain of floating islands where memory, weather, and craft are tightly intertwined.',
      founderId: founder.id,
    },
  });

  // Development seed data is disposable: reruns intentionally normalize this fixture
  // back to one active FOUNDER membership instead of preserving manual local edits.
  await ensureActiveFounderMembership(prisma, {
    worldId: world.id,
    userId: founder.id,
  });

  await prisma.worldMembership.upsert({
    where: {
      worldId_userId: {
        worldId: world.id,
        userId: contributor.id,
      },
    },
    update: {
      role: WorldRole.CONTRIBUTOR,
      grantedById: founder.id,
      revokedAt: null,
    },
    create: {
      worldId: world.id,
      userId: contributor.id,
      role: WorldRole.CONTRIBUTOR,
      grantedById: founder.id,
    },
  });

  await prisma.worldSeed.upsert({
    where: {
      worldId: world.id,
    },
    update: {
      genre: 'Fantasy',
      mainConflict: 'Weather, memory, and craft compete to define what the islands remember.',
      premise:
        'A fictional chain of floating islands where memory, weather, and craft are tightly intertwined.',
      tone: 'Luminous mystery',
    },
    create: {
      worldId: world.id,
      premise:
        'A fictional chain of floating islands where memory, weather, and craft are tightly intertwined.',
      genre: 'Fantasy',
      tone: 'Luminous mystery',
      mainConflict: 'Weather, memory, and craft compete to define what the islands remember.',
      startingLocation: 'Mirror Lighthouse',
      firstCharacters: ['Ember Quill', 'Mira Vale'],
      firstFactions: ['Cartographers Guild'],
      firstHistoricalEvent: 'The first reflected storm appears before its clouds arrive.',
    },
  });

  await prisma.worldBibleVersion.upsert({
    where: {
      worldId_versionNumber: {
        worldId: world.id,
        versionNumber: 1,
      },
    },
    update: {
      changeSummary: 'Initial fictional development bible.',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The Glass Archipelago is a development-only world seed for local schema validation.',
              },
            ],
          },
        ],
      },
      publishedAt: new Date(),
    },
    create: {
      worldId: world.id,
      versionNumber: 1,
      creatorId: founder.id,
      changeSummary: 'Initial fictional development bible.',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The Glass Archipelago is a development-only world seed for local schema validation.',
              },
            ],
          },
        ],
      },
      publishedAt: new Date(),
    },
  });

  const lighthouse = await prisma.loreEntry.upsert({
    where: {
      worldId_slug: {
        worldId: world.id,
        slug: 'mirror-lighthouse',
      },
    },
    update: {
      title: 'Mirror Lighthouse',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A tower that reflects storms before they arrive.' }],
          },
        ],
      },
    },
    create: {
      worldId: world.id,
      authorId: contributor.id,
      title: 'Mirror Lighthouse',
      slug: 'mirror-lighthouse',
      loreType: 'LOCATION',
      status: 'DRAFT',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A tower that reflects storms before they arrive.' }],
          },
        ],
      },
    },
  });

  const guild = await prisma.loreEntry.upsert({
    where: {
      worldId_slug: {
        worldId: world.id,
        slug: 'cartographers-guild',
      },
    },
    update: {
      title: 'Cartographers Guild',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Mapmakers who chart both islands and remembered routes.' },
            ],
          },
        ],
      },
    },
    create: {
      worldId: world.id,
      authorId: founder.id,
      title: 'Cartographers Guild',
      slug: 'cartographers-guild',
      loreType: 'FACTION',
      status: 'DRAFT',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Mapmakers who chart both islands and remembered routes.' },
            ],
          },
        ],
      },
    },
  });

  await prisma.loreRelationship.upsert({
    where: {
      worldId_sourceId_targetId_relationType: {
        worldId: world.id,
        sourceId: guild.id,
        targetId: lighthouse.id,
        relationType: 'maintains',
      },
    },
    update: {
      metadata: { note: 'Development-only lore graph fixture.' },
    },
    create: {
      worldId: world.id,
      sourceId: guild.id,
      targetId: lighthouse.id,
      relationType: 'maintains',
      metadata: { note: 'Development-only lore graph fixture.' },
    },
  });

  const proposal = await prisma.proposal.upsert({
    where: { id: 'dev-proposal-glass-archipelago-001' },
    update: {
      status: 'SUBMITTED',
      summary: 'Suggests expanding lighthouse weather rules for local development data.',
    },
    create: {
      id: 'dev-proposal-glass-archipelago-001',
      worldId: world.id,
      authorId: contributor.id,
      proposalType: 'UPDATE_LORE',
      status: 'SUBMITTED',
      title: 'Clarify Mirror Lighthouse storm reflections',
      summary: 'Suggests expanding lighthouse weather rules for local development data.',
      proposedContent: {
        target: 'mirror-lighthouse',
        change: 'Add a constraint that reflected storms are visible only at dawn.',
      },
      targetLoreEntryId: lighthouse.id,
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  await prisma.contributionDraft.upsert({
    where: {
      id: 'dev-contribution-glass-archipelago-001',
    },
    update: {
      kind: 'LORE',
      title: 'Draft: Lighthouse Keeper Oath',
      summary: 'Development-only structured contribution draft.',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Lighthouse Keeper Oath' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Keepers swear to report reflected storms before dawn bells sound.',
              },
            ],
          },
        ],
      },
      status: 'DRAFT',
      proposalId: null,
      submittedAt: null,
      targetLoreEntryId: lighthouse.id,
    },
    create: {
      id: 'dev-contribution-glass-archipelago-001',
      worldId: world.id,
      authorId: contributor.id,
      kind: 'LORE',
      title: 'Draft: Lighthouse Keeper Oath',
      summary: 'Development-only structured contribution draft.',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Lighthouse Keeper Oath' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Keepers swear to report reflected storms before dawn bells sound.',
              },
            ],
          },
        ],
      },
      targetLoreEntryId: lighthouse.id,
    },
  });

  await prisma.aIReport.upsert({
    where: { id: 'dev-ai-report-glass-archipelago-001' },
    update: {
      status: 'COMPLETED',
      summary: 'Development-only advisory report. No canon decision is implied.',
      findings: { conflicts: [], continuityNotes: ['No existing contradiction in fixture data.'] },
    },
    create: {
      id: 'dev-ai-report-glass-archipelago-001',
      proposalId: proposal.id,
      provider: 'fictional-local-provider',
      model: 'fictional-consistency-model',
      status: 'COMPLETED',
      summary: 'Development-only advisory report. No canon decision is implied.',
      findings: { conflicts: [], continuityNotes: ['No existing contradiction in fixture data.'] },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
