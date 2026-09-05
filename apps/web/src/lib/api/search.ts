import { apiClient } from '@/lib/api/client';

export type SearchEntityType = 'WORLD' | 'LORE_ENTRY';

export type SearchResult = {
  entityId: string;
  entityType: SearchEntityType;
  metadata: unknown;
  rank: number;
  title: string;
  worldId: string | null;
};

export function searchWorldLore(params: {
  page?: number;
  pageSize?: number;
  q: string;
  type?: SearchEntityType;
  worldId?: string;
}) {
  const searchParams = new URLSearchParams({
    q: params.q,
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
  });

  if (params.type) {
    searchParams.set('type', params.type);
  }

  if (params.worldId) {
    searchParams.set('worldId', params.worldId);
  }

  return apiClient.get<{
    pageInfo: {
      hasMore: boolean;
      page: number;
      pageSize: number;
    };
    results: SearchResult[];
  }>(`/search?${searchParams.toString()}`);
}
