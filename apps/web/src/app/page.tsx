'use client';

import { useEffect, useMemo, useState } from 'react';

import { HiveBrand } from '@/components/hive-brand';
import { ThemeSwitcher } from '@/components/theme-switcher';
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <HiveBrand className="h-9 w-11" />
            <span className="text-lg font-semibold tracking-normal">HiveLore</span>
          </div>
          <ThemeSwitcher />
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_24rem]">
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Welcome back to HiveLore.
            </h1>
            <p className="prose-text mt-5 max-w-2xl">
              Sign in to contribute, vote, and build trusted Hive knowledge.
            </p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Hive accounts are the canonical identity. Signing a challenge proves account control
              and never gives HiveLore permission to publish, transfer, or hold private keys.
            </p>
          </div>

          <div className="rounded-panel border border-border bg-surface p-5 shadow-elevated">
            {user ? (
              <div className="grid gap-4">
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
                  isLoading={isLoading && provider === 'keychain'}
                  loadingLabel="Waiting for signature"
                  onClick={handleKeychainLogin}
                  variant="hive"
                  disabled={!canSubmit}
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

                {env.googleAuthEnabled ? (
                  <Button variant="secondary">Continue with Google</Button>
                ) : null}

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
        </section>
      </div>
    </main>
  );
}
