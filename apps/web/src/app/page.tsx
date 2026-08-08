'use client';

import { useEffect, useMemo, useState } from 'react';

import { LoreAtlasBackground } from '@/components/auth/lore-atlas-background';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createAuthChallenge,
  getMe,
  logoutAuthSession,
  refreshAuthSession,
  verifyAuthChallenge,
  type AuthChallengeResponse,
  type AuthProvider,
  type SafeUser,
} from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { clearStoredAccessToken, storeAccessToken } from '@/lib/api/session';
import { env } from '@/lib/env';

type HiveKeychainResponse = {
  success: boolean;
  error?: string;
  message?: string;
  result?: string;
  publicKey?: string;
};

declare global {
  interface Window {
    hive_keychain?: {
      requestSignBuffer(
        username: string,
        message: string,
        keyType: 'Posting',
        callback: (response: HiveKeychainResponse) => void,
      ): void;
    };
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Authentication failed.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Authentication failed.';
}

function signWithKeychain(username: string, message: string) {
  return new Promise<HiveKeychainResponse>((resolve, reject) => {
    if (!window.hive_keychain) {
      reject(new Error('Hive Keychain is not available in this browser.'));
      return;
    }

    window.hive_keychain.requestSignBuffer(username, message, 'Posting', (response) => {
      if (!response.success) {
        reject(new Error(response.error ?? response.message ?? 'Signature request was rejected.'));
        return;
      }

      resolve(response);
    });
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.24 1 12s.43 3.45 1.18 4.94l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function Home() {
  const [challenge, setChallenge] = useState<AuthChallengeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualSignature, setManualSignature] = useState('');
  const [manualPublicKey, setManualPublicKey] = useState('');
  const [provider, setProvider] = useState<AuthProvider>('keychain');
  const [user, setUser] = useState<SafeUser | null>(null);
  const [username, setUsername] = useState('');

  const canSubmit = useMemo(() => username.trim().length > 0 && !isLoading, [isLoading, username]);

  useEffect(() => {
    let isMounted = true;

    refreshAuthSession()
      .then((session) => {
        if (!isMounted) {
          return;
        }

        storeAccessToken(session.accessToken);
        setUser(session.user);
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function completeLogin(
    nextChallenge: AuthChallengeResponse,
    signature: string,
    publicKey?: string,
  ) {
    const session = await verifyAuthChallenge({
      challengeId: nextChallenge.challengeId,
      message: nextChallenge.message,
      provider: nextChallenge.provider,
      signature,
      username: nextChallenge.hiveUsername,
      ...(publicKey ? { publicKey } : {}),
    });

    storeAccessToken(session.accessToken);
    setUser(session.user);
    setChallenge(null);
    setManualSignature('');
    setManualPublicKey('');
  }

  async function handleKeychainLogin() {
    setError(null);
    setIsLoading(true);
    setProvider('keychain');

    try {
      const nextChallenge = await createAuthChallenge(username, 'keychain');
      const signaturePayload = await sha256Hex(nextChallenge.message);
      const signature = await signWithKeychain(nextChallenge.hiveUsername, signaturePayload);

      await completeLogin(nextChallenge, signature.result ?? '', signature.publicKey);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleHiveSignerStart() {
    setError(null);
    setIsLoading(true);
    setProvider('hivesigner');

    try {
      setChallenge(await createAuthChallenge(username, 'hivesigner'));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleManualVerify() {
    if (!challenge) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await completeLogin(challenge, manualSignature, manualPublicKey || undefined);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    setError(null);
    setIsLoading(true);

    try {
      const session = await refreshAuthSession();
      storeAccessToken(session.accessToken);
      setUser(session.user);
      await getMe(session.accessToken);
    } catch (nextError) {
      clearStoredAccessToken();
      setUser(null);
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setError(null);
    setIsLoading(true);

    try {
      await logoutAuthSession();
      clearStoredAccessToken();
      setUser(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-atlas-page">
      <LoreAtlasBackground />
      <div className="auth-atlas-page__content grid items-center gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="auth-atlas-page__hero">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Welcome back to HiveLore.
          </h1>
          <p className="prose-text mt-5 max-w-2xl">
            Sign in to contribute, vote, and build trusted Hive knowledge.
          </p>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Hive accounts are the canonical identity. Signing a challenge proves account control and
            never gives HiveLore permission to publish, transfer, or hold private keys.
          </p>
        </div>

        <div className="auth-atlas-page__form rounded-panel border border-border bg-surface p-4 shadow-elevated sm:p-5">
          {user ? (
            <div className="grid gap-3.5">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Signed in as</p>
                <p className="mt-1 text-2xl font-semibold">@{user.hiveUsername}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <Button isLoading={isLoading} onClick={handleRefresh} variant="secondary">
                  Refresh Session
                </Button>
                <Button isLoading={isLoading} onClick={handleLogout} variant="outline">
                  Log Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Hive username
                <Input
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="alice"
                  value={username}
                />
              </label>

              <Button
                disabled={!canSubmit}
                isLoading={isLoading && provider === 'keychain'}
                loadingLabel="Waiting for signature"
                onClick={handleKeychainLogin}
                variant="hive"
              >
                Sign in with Hive Keychain
              </Button>

              <div className="flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                disabled={!canSubmit}
                isLoading={isLoading && provider === 'hivesigner'}
                loadingLabel="Creating challenge"
                onClick={handleHiveSignerStart}
                variant="outline"
              >
                Continue with HiveSigner
              </Button>

              <Button
                disabled={!env.googleAuthEnabled}
                leftIcon={<GoogleIcon />}
                title={
                  env.googleAuthEnabled
                    ? 'Continue with Google'
                    : 'Google onboarding is not enabled in this environment.'
                }
                variant="secondary"
              >
                Continue with Google
              </Button>

              <p className="text-sm leading-6 text-muted-foreground">
                Google creates or connects a Hive account behind the scenes.
              </p>

              <p className="text-sm leading-6 text-muted-foreground">
                No password is stored by HiveLore.
              </p>
            </div>
          )}

          {challenge ? (
            <div className="mt-5 grid gap-3 border-t border-border pt-5">
              <label className="grid gap-2 text-sm font-semibold">
                Challenge message
                <textarea
                  className="min-h-36 rounded-control border border-input-border bg-surface px-3 py-2 font-mono text-xs text-foreground"
                  readOnly
                  value={challenge.message}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Signature
                <Input
                  onChange={(event) => setManualSignature(event.target.value)}
                  placeholder="Paste HiveSigner signature"
                  value={manualSignature}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Public key
                <Input
                  onChange={(event) => setManualPublicKey(event.target.value)}
                  placeholder="Optional recovered public key"
                  value={manualPublicKey}
                />
              </label>
              <Button
                disabled={!manualSignature || isLoading}
                isLoading={isLoading}
                onClick={handleManualVerify}
                variant="primary"
              >
                Verify Signature
              </Button>
            </div>
          ) : null}

          {error ? (
            <Alert className="mt-5" variant="danger">
              <AlertTitle>Authentication failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
