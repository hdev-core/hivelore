import { apiClient } from '@/lib/api/client';

export type WorldSeed = {
  id: string;
  worldId: string;
  premise: string;
  genre: string;
  tone: string;
  mainConflict: string;
  startingLocation: string | null;
  firstCharacters: string[];
  firstFactions: string[];
  firstHistoricalEvent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorldBibleVersion = {
  id: string;
  worldId: string;
  versionNumber: number;
  creatorId: string;
  content: unknown;
  changeSummary: string | null;
  publishedAt: string | null;
  hiveReferenceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorldFounder = {
  id: string;
  hiveUsername: string;
  normalizedHiveUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type WorldSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  founderId: string;
  founder: WorldFounder;
  seed: WorldSeed | null;
  currentBibleVersion: WorldBibleVersion | null;
  createdAt: string;
  updatedAt: string;
};

export type WorldHub = {
  world: WorldSummary;
  stats: {
    activeProposalCount: number;
    canonLoreCount: number;
  };
  latestLoreEntries: Array<{
    id: string;
    loreType: string;
    slug: string;
    status: string;
    title: string;
    updatedAt: string;
  }>;
};

export type WorldSort = 'newest' | 'most-active';

export type WorldsPagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type CreateWorldInput = {
  title: string;
  description: string;
  seed: {
    premise: string;
    genre: string;
    tone: string;
    mainConflict: string;
    startingLocation?: string;
    firstCharacters?: string[];
    firstFactions?: string[];
    firstHistoricalEvent?: string;
  };
  bible: {
    changeSummary?: string;
    content: Record<string, unknown>;
  };
};

export function listWorlds(
  params: { genre?: string; page?: number; pageSize?: number; q?: string; tone?: string } = {},
) {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 24),
  });

  if (params.q) {
    searchParams.set('q', params.q);
  }

  if (params.genre) {
    searchParams.set('genre', params.genre);
  }

  if (params.tone) {
    searchParams.set('tone', params.tone);
  }

  return apiClient.get<{
    pagination: WorldsPagination;
    worlds: WorldSummary[];
  }>(`/worlds?${searchParams.toString()}`);
}

export function getWorldHub(worldId: string) {
  return apiClient.get<WorldHub>(`/worlds/${encodeURIComponent(worldId)}/hub`);
}

export function createWorld(input: CreateWorldInput, accessToken: string) {
  return apiClient.post<{ world: WorldSummary }>('/worlds', input, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}
