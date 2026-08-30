import { normalizeHiveUsername } from './hive-username.js';

export type ReputationLevel = {
  badge: string;
  label: string;
  nextScore: number | null;
};

export type UserProfileDatabase = {
  user: {
    findUnique(args: unknown): Promise<{
      avatarUrl: string | null;
      bio: string | null;
      createdAt: Date;
      displayName: string | null;
      hiveUsername: string;
      id: string;
      normalizedHiveUsername: string;
      contributionDrafts: Array<{
        id: string;
        kind: string;
        proposal: { id: string; status: string; submittedAt: Date | null } | null;
        status: string;
        submittedAt: Date | null;
        title: string;
        updatedAt: Date;
        world: { id: string; slug: string; title: string };
      }>;
      loreEntries: Array<{
        id: string;
        loreType: string;
        slug: string;
        status: string;
        title: string;
        updatedAt: Date;
        world: { id: string; slug: string; title: string };
      }>;
      reputationSnapshots: Array<{
        breakdown: unknown;
        calculatedAt: Date;
        calculationVersion: string;
        score: { toString(): string } | number | string;
      }>;
      votes: Array<{
        choice: string;
        createdAt: Date;
        proposal: {
          id: string;
          status: string;
          title: string;
          world: { id: string; slug: string; title: string };
        };
      }>;
    } | null>;
  };
};

export function getReputationLevel(score: number): ReputationLevel {
  if (score >= 250) {
    return { badge: 'Worldsmith', label: 'Worldsmith', nextScore: null };
  }

  if (score >= 100) {
    return { badge: 'Canon Keeper', label: 'Canon Keeper', nextScore: 250 };
  }

  if (score >= 25) {
    return { badge: 'Contributor', label: 'Contributor', nextScore: 100 };
  }

  return { badge: 'Seedling', label: 'Seedling', nextScore: 25 };
}

function scoreToNumber(score: { toString(): string } | number | string) {
  return Number(score.toString());
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

export async function getUserProfile(database: UserProfileDatabase, username: string) {
  const normalizedHiveUsername = normalizeHiveUsername(username);
  const user = await database.user.findUnique({
    where: { normalizedHiveUsername },
    select: {
      avatarUrl: true,
      bio: true,
      createdAt: true,
      displayName: true,
      hiveUsername: true,
      id: true,
      normalizedHiveUsername: true,
      contributionDrafts: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          kind: true,
          proposal: { select: { id: true, status: true, submittedAt: true } },
          status: true,
          submittedAt: true,
          title: true,
          updatedAt: true,
          world: { select: { id: true, slug: true, title: true } },
        },
        take: 10,
      },
      loreEntries: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          loreType: true,
          slug: true,
          status: true,
          title: true,
          updatedAt: true,
          world: { select: { id: true, slug: true, title: true } },
        },
        take: 10,
      },
      reputationSnapshots: {
        orderBy: { calculatedAt: 'desc' },
        select: {
          breakdown: true,
          calculatedAt: true,
          calculationVersion: true,
          score: true,
        },
        take: 1,
      },
      votes: {
        orderBy: { createdAt: 'desc' },
        select: {
          choice: true,
          createdAt: true,
          proposal: {
            select: {
              id: true,
              status: true,
              title: true,
              world: { select: { id: true, slug: true, title: true } },
            },
          },
        },
        take: 10,
      },
    },
  });

  if (!user) {
    return null;
  }

  const snapshot = user.reputationSnapshots[0] ?? null;
  const score = snapshot ? scoreToNumber(snapshot.score) : 0;

  return {
    user: {
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
      displayName: user.displayName,
      hiveUsername: user.hiveUsername,
      id: user.id,
      normalizedHiveUsername: user.normalizedHiveUsername,
    },
    reputation: {
      breakdown: snapshot?.breakdown ?? null,
      calculatedAt: serializeDate(snapshot?.calculatedAt ?? null),
      calculationVersion: snapshot?.calculationVersion ?? null,
      level: getReputationLevel(score),
      score,
    },
    history: {
      contributions: user.contributionDrafts.map((draft) => ({
        id: draft.id,
        kind: draft.kind,
        proposal: draft.proposal
          ? {
              id: draft.proposal.id,
              status: draft.proposal.status,
              submittedAt: serializeDate(draft.proposal.submittedAt),
            }
          : null,
        status: draft.status,
        submittedAt: serializeDate(draft.submittedAt),
        title: draft.title,
        updatedAt: draft.updatedAt.toISOString(),
        world: draft.world,
      })),
      loreEntries: user.loreEntries.map((entry) => ({
        id: entry.id,
        loreType: entry.loreType,
        slug: entry.slug,
        status: entry.status,
        title: entry.title,
        updatedAt: entry.updatedAt.toISOString(),
        world: entry.world,
      })),
      votes: user.votes.map((vote) => ({
        choice: vote.choice,
        createdAt: vote.createdAt.toISOString(),
        proposal: vote.proposal,
      })),
    },
  };
}
