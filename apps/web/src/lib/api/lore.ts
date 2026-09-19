import { apiClient } from '@/lib/api/client';
import type { LoreType } from '@/lib/worlds/constants';

export type LoreStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED_FOR_PUBLICATION' | 'PUBLISHED_CANON' | 'ARCHIVED';

export type LoreEntryContent = {
  body?: string;
  entityType?: string;
  fields?: Record<string, string>;
  summary?: string;
  tags?: string[];
};

export type LoreRelationshipSummary = {
  id: string;
  relationType: string;
  source?: Pick<LoreEntry, 'id' | 'loreType' | 'slug' | 'status' | 'title'>;
  target?: Pick<LoreEntry, 'id' | 'loreType' | 'slug' | 'status' | 'title'>;
};

export type LoreEntry = {
  id: string;
  worldId: string;
  authorId?: string;
  title: string;
  slug: string;
  loreType: LoreType;
  content: LoreEntryContent | unknown;
  status: LoreStatus;
  publishedAt: string | null;
  hiveReferenceId?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    hiveUsername: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  outgoingRelations?: LoreRelationshipSummary[];
  incomingRelations?: LoreRelationshipSummary[];
};

export type LoreEntryInput = {
  title: string;
  loreType: LoreType;
  status?: LoreStatus;
  content: LoreEntryContent;
};

export function listLoreEntries(
  worldId: string,
  params: { loreType?: LoreType; q?: string; status?: LoreStatus } = {},
  accessToken?: string | null,
) {
  const searchParams = new URLSearchParams({
    page: '1',
    pageSize: '100',
  });

  if (params.loreType) {
    searchParams.set('loreType', params.loreType);
  }

  if (params.q) {
    searchParams.set('q', params.q);
  }

  if (params.status) {
    searchParams.set('status', params.status);
  }

  return apiClient.get<{
    entries: LoreEntry[];
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
    };
  }>(`/worlds/${encodeURIComponent(worldId)}/lore?${searchParams.toString()}`, {
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      : {}),
  });
}

export function getLoreEntry(worldId: string, entryId: string, accessToken?: string | null) {
  return apiClient.get<{ entry: LoreEntry }>(
    `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(entryId)}`,
    {
      ...(accessToken
        ? {
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          }
        : {}),
    },
  );
}

export function createLoreEntry(worldId: string, input: LoreEntryInput, accessToken: string) {
  return apiClient.post<{ entry: LoreEntry }>(
    `/worlds/${encodeURIComponent(worldId)}/lore`,
    input,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function updateLoreEntry(
  worldId: string,
  entryId: string,
  input: Partial<LoreEntryInput>,
  accessToken: string,
) {
  return apiClient.patch<{ entry: LoreEntry }>(
    `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(entryId)}`,
    input,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function deleteLoreEntry(worldId: string, entryId: string, accessToken: string) {
  return apiClient.delete<{ ok: true }>(
    `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(entryId)}`,
    undefined,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function createLoreRelationship(
  worldId: string,
  entryId: string,
  input: {
    relationType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
  accessToken: string,
) {
  return apiClient.post<{ relationship: LoreRelationshipSummary }>(
    `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(entryId)}/relationships`,
    input,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function deleteLoreRelationship(
  worldId: string,
  entryId: string,
  relationshipId: string,
  accessToken: string,
) {
  return apiClient.delete<void>(
    `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(
      entryId,
    )}/relationships/${encodeURIComponent(relationshipId)}`,
    undefined,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}
