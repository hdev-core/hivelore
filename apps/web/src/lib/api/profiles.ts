import { apiClient } from '@/lib/api/client';

export type UserProfile = {
  user: {
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
    displayName: string | null;
    hiveUsername: string;
    id: string;
    normalizedHiveUsername: string;
  };
  reputation: {
    breakdown: unknown;
    calculatedAt: string | null;
    calculationVersion: string | null;
    level: {
      badge: string;
      label: string;
      nextScore: number | null;
    };
    score: number;
  };
  history: {
    contributions: Array<{
      id: string;
      kind: string;
      proposal: { id: string; status: string; submittedAt: string | null } | null;
      status: string;
      submittedAt: string | null;
      title: string;
      updatedAt: string;
      world: { id: string; slug: string; title: string };
    }>;
    loreEntries: Array<{
      id: string;
      loreType: string;
      slug: string;
      status: string;
      title: string;
      updatedAt: string;
      world: { id: string; slug: string; title: string };
    }>;
    votes: Array<{
      choice: string;
      createdAt: string;
      proposal: {
        id: string;
        status: string;
        title: string;
        world: { id: string; slug: string; title: string };
      };
    }>;
  };
};

export function getUserProfile(username: string) {
  return apiClient.get<UserProfile>(`/profiles/${encodeURIComponent(username)}`);
}
