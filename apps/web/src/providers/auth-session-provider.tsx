'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError } from '@/lib/api/errors';
import {
  logoutAuthSession,
  refreshAuthSession,
  type AuthSessionResponse,
  type SafeUser,
} from '@/lib/api/auth';

const AUTH_SESSION_CHANNEL = 'hivelore-auth-session';
const AUTH_REFRESH_LOCK = 'hivelore-auth-refresh';

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
  const accessTokenRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const latestSessionRef = useRef<AuthSessionResponse | null>(null);
  const refreshPromiseRef = useRef<Promise<AuthSessionResponse> | null>(null);
  const userRef = useRef<SafeUser | null>(null);

  const setSession = useCallback((session: AuthSessionResponse) => {
    accessTokenRef.current = session.accessToken;
    latestSessionRef.current = session;
    userRef.current = session.user;
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const startingAccessToken = accessTokenRef.current;

    const performRefresh = async () => {
      if (
        latestSessionRef.current &&
        latestSessionRef.current.accessToken !== startingAccessToken
      ) {
        return latestSessionRef.current;
      }

      return refreshAuthSessionOnce();
    };

    const lockedRefresh: Promise<AuthSessionResponse> = (
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request(AUTH_REFRESH_LOCK, async () => performRefresh())
        : performRefresh()
    ) as Promise<AuthSessionResponse>;

    const refreshPromise = lockedRefresh
      .then((session) => {
        setSession(session);
        channelRef.current?.postMessage({
          session,
          type: 'session-refreshed',
        });
        return session;
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          accessTokenRef.current = null;
          latestSessionRef.current = null;
          userRef.current = null;
          setAccessToken(null);
          setUser(null);
        }

        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [setSession]);

  const clearSession = useCallback(async () => {
    try {
      await logoutAuthSession();
    } finally {
      accessTokenRef.current = null;
      latestSessionRef.current = null;
      userRef.current = null;
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    channelRef.current = channel;

    channel.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { session?: AuthSessionResponse; type?: string };

      if (data.type === 'session-refreshed' && data.session) {
        setSession(data.session);
      }
    });

    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [setSession]);

  useEffect(() => {
    let isMounted = true;

    refreshSession()
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
  }, [refreshSession, setSession]);

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
