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

function contributionPath(worldId: string, contributionId?: string) {
  const base = `/worlds/${encodeURIComponent(worldId)}/contributions`;

  return contributionId ? `${base}/${encodeURIComponent(contributionId)}` : base;
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
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
