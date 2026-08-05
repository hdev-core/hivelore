'use client';

const ACCESS_TOKEN_KEY = 'hivelore-access-token';

export function getStoredAccessToken() {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeAccessToken(accessToken: string) {
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } catch {
    // Authenticated API calls still work for this render pass if storage is unavailable.
  }
}

export function clearStoredAccessToken() {
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Ignore storage failures during logout.
  }
}
