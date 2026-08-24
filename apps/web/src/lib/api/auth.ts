import { apiClient } from '@/lib/api/client';

export type AuthProvider = 'keychain' | 'hivesigner';

export type SafeUser = {
  id: string;
  hiveUsername: string;
  normalizedHiveUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  platformRole: 'USER' | 'ADMIN';
};

export type AuthChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  expiresInSeconds: number;
  hiveUsername: string;
  message: string;
  provider: AuthProvider;
};

export type AuthSessionResponse = {
  accessToken: string;
  expiresInSeconds: number;
  user: SafeUser;
};

export function createAuthChallenge(username: string, provider: AuthProvider) {
  return apiClient.post<AuthChallengeResponse>('/auth/challenge', {
    provider,
    username,
  });
}

export function verifyAuthChallenge(input: {
  challengeId: string;
  message: string;
  provider: AuthProvider;
  publicKey?: string;
  signature: string;
  username: string;
}) {
  return apiClient.post<AuthSessionResponse>('/auth/verify', input);
}

export function refreshAuthSession(options: { signal?: AbortSignal | null } = {}) {
  return apiClient.post<AuthSessionResponse>('/auth/refresh', {}, { ...options, timeoutMs: null });
}

export function logoutAuthSession() {
  return apiClient.post<{ ok: true }>('/auth/logout', {});
}

export function getMe(accessToken: string) {
  return apiClient.get<{ user: SafeUser }>('/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}
