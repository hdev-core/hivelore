import { apiClient } from '@/lib/api/client';

export type ContributionKind = 'LORE' | 'STORY';
export type ContributionStatus = 'DRAFT' | 'SUBMITTED';

export type StructuredContributionContent = Record<string, unknown>;

export type ContributionTargetLoreEntry = {
  id: string;
  loreType: string;
  slug: string;
  title: string;
  worldId: string;
};

export type Proposal = {
  id: string;
  proposalType: string;
  status: string;
  submittedAt: string | null;
  title: string;
  worldId: string;
};

export type Contribution = {
  id: string;
  authorId: string;
  content: StructuredContributionContent;
  createdAt: string;
  kind: ContributionKind;
  proposal: Proposal | null;
  proposalId: string | null;
  status: ContributionStatus;
  submittedAt: string | null;
  summary: string | null;
  targetLoreEntry: ContributionTargetLoreEntry | null;
  targetLoreEntryId: string | null;
  title: string;
  updatedAt: string;
  worldId: string;
};

export type ContributionInput = {
  content: StructuredContributionContent;
  kind: ContributionKind;
  summary?: string;
  targetLoreEntryId?: string;
  title: string;
};

export type ContributionsQuery = {
  kind?: ContributionKind;
  page?: number;
  pageSize?: number;
  status?: ContributionStatus;
};

export type ContributionsListResponse = {
  contributions: Contribution[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

function contributionPath(worldId: string, contributionId?: string) {
  const base = `/worlds/${encodeURIComponent(worldId)}/contributions`;

  return contributionId ? `${base}/${encodeURIComponent(contributionId)}` : base;
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

function buildContributionListPath(worldId: string, query: ContributionsQuery = {}) {
  const searchParams = new URLSearchParams();

  if (query.kind) {
    searchParams.set('kind', query.kind);
  }

  if (query.page) {
    searchParams.set('page', String(query.page));
  }

  if (query.pageSize) {
    searchParams.set('pageSize', String(query.pageSize));
  }

  if (query.status) {
    searchParams.set('status', query.status);
  }

  const queryString = searchParams.toString();

  return `${contributionPath(worldId)}${queryString ? `?${queryString}` : ''}`;
}

export function listContributions(worldId: string, query: ContributionsQuery, accessToken: string) {
  return apiClient.get<ContributionsListResponse>(buildContributionListPath(worldId, query), {
    headers: authHeaders(accessToken),
  });
}

export function createContribution(worldId: string, input: ContributionInput, accessToken: string) {
  return apiClient.post<{ contribution: Contribution }>(contributionPath(worldId), input, {
    headers: authHeaders(accessToken),
  });
}

export function updateContribution(
  worldId: string,
  contributionId: string,
  input: Partial<ContributionInput>,
  accessToken: string,
) {
  return apiClient.patch<{ contribution: Contribution }>(
    contributionPath(worldId, contributionId),
    input,
    {
      headers: authHeaders(accessToken),
    },
  );
}

export function submitContribution(worldId: string, contributionId: string, accessToken: string) {
  return apiClient.post<{
    alreadySubmitted: boolean;
    contribution: Contribution;
    proposal: Proposal | null;
  }>(`${contributionPath(worldId, contributionId)}/submit`, undefined, {
    headers: authHeaders(accessToken),
  });
}
