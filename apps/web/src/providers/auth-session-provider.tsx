'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  logoutAuthSession,
  refreshAuthSession,
  type AuthSessionResponse,
  type SafeUser,
} from '@/lib/api/auth';

type AuthSessionContextValue = {
  accessToken: string | null;
  clearSession: () => Promise<void>;
  isSessionLoading: boolean;
  refreshSession: () => Promise<AuthSessionResponse>;
  setSession: (session: AuthSessionResponse) => void;
  user: SafeUser | null;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

let refreshSessionPromise: Promise<AuthSessionResponse> | null = null;

function refreshAuthSessionOnce() {
  refreshSessionPromise ??= refreshAuthSession().finally(() => {
    refreshSessionPromise = null;
  });

  return refreshSessionPromise;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [user, setUser] = useState<SafeUser | null>(null);

  const setSession = useCallback((session: AuthSessionResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await refreshAuthSessionOnce();
      setSession(session);
      return session;
    } catch (error) {
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, [setSession]);

  const clearSession = useCallback(async () => {
    try {
      await logoutAuthSession();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    refreshAuthSessionOnce()
      .then((session) => {
        if (isMounted) {
          setSession(session);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setSession]);

  const value = useMemo(
    () => ({
      accessToken,
      clearSession,
      isSessionLoading,
      refreshSession,
      setSession,
      user,
    }),
    [accessToken, clearSession, isSessionLoading, refreshSession, setSession, user],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);

  if (!value) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }

  return value;
}
