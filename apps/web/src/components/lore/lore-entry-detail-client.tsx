'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/errors';
import { getLoreEntry, type LoreEntry } from '@/lib/api/lore';
import { getStoredAccessToken } from '@/lib/api/session';

import {
  getEntryBody,
  getEntryFields,
  getEntrySummary,
  getEntryTags,
  getReadableBodyText,
  getCardEntityTypeFromApiType,
  getLoreTypeLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from './lore-utils';

type LoreEntryDetailClientProps = {
  entryId: string;
  initialEntry?: LoreEntry | null;
  worldId: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Lore entry could not be loaded.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Lore entry could not be loaded.';
}

function RelationshipStatusBadge({ status }: { status?: LoreEntry['status'] }) {
  if (!status || status === 'PUBLISHED_CANON') {
    return null;
  }

  return <Badge variant={getStatusBadgeVariant(status)}>{getStatusLabel(status)}</Badge>;
}

function LoreEntryContent({ entry, worldId }: { entry: LoreEntry; worldId: string }) {
  const body = getEntryBody(entry);
  const readableBody = getReadableBodyText(body);
  const fields = getEntryFields(entry);
  const tags = getEntryTags(entry);
  const outgoingRelations = entry.outgoingRelations ?? [];
  const incomingRelations = entry.incomingRelations ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <main className="space-y-6">
        <section>
          <div className="flex flex-wrap gap-2">
            <Badge>
              {getLoreTypeLabel(getCardEntityTypeFromApiType(entry.loreType, entry.content))}
            </Badge>
            <Badge variant={getStatusBadgeVariant(entry.status)}>
              {getStatusLabel(entry.status)}
            </Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-normal text-foreground">
            {entry.title}
          </h1>
          <p className="prose-text mt-5 max-w-2xl">{getEntrySummary(entry) || 'No summary yet.'}</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {readableBody ? (
              <p className="prose-text max-w-none whitespace-pre-wrap">{readableBody}</p>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">No description yet.</p>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Structured fields</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(fields).length ? (
                <dl className="grid gap-4 text-sm">
                  {Object.entries(fields).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-semibold capitalize text-muted-foreground">
                        {key.replaceAll('-', ' ')}
                      </dt>
                      <dd className="mt-1 leading-6">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">No structured fields yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connected lore</CardTitle>
            </CardHeader>
            <CardContent>
              {outgoingRelations.length || incomingRelations.length ? (
                <ul className="space-y-3">
                  {outgoingRelations.map((relationship) => (
                    <li className="text-sm leading-6" key={relationship.id}>
                      <span className="font-semibold capitalize">
                        {relationship.relationType.replaceAll('_', ' ')}
                      </span>{' '}
                      {relationship.target ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Link
                            className="text-[var(--hive-red)] underline-offset-4 hover:underline"
                            href={`/worlds/${worldId}/lore/${relationship.target.id}`}
                          >
                            {relationship.target.title}
                          </Link>
                          <RelationshipStatusBadge status={relationship.target.status} />
                        </span>
                      ) : (
                        'Unknown entry'
                      )}
                    </li>
                  ))}
                  {incomingRelations.map((relationship) => (
                    <li className="text-sm leading-6" key={relationship.id}>
                      {relationship.source ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Link
                            className="text-[var(--hive-red)] underline-offset-4 hover:underline"
                            href={`/worlds/${worldId}/lore/${relationship.source.id}`}
                          >
                            {relationship.source.title}
                          </Link>
                          <RelationshipStatusBadge status={relationship.source.status} />
                        </span>
                      ) : (
                        'Unknown entry'
                      )}{' '}
                      <span className="font-semibold capitalize">
                        {relationship.relationType.replaceAll('_', ' ')}
                      </span>{' '}
                      this entry
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">No connections yet.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <aside className="space-y-6">
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Extend, revise, or return to the world.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-[var(--hive-red)] bg-[var(--hive-red)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--hive-red)_88%,black)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href={`/worlds/${worldId}/contribute?entryId=${entry.id}`}
              >
                Suggest edit
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href={`/worlds/${worldId}/contribute?type=${entry.loreType}`}
              >
                Extend this lore
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href={`/worlds/${worldId}`}
              >
                Back to world
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>World graph context and authorship.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-muted-foreground">Creator</dt>
                <dd className="mt-1">
                  {entry.author?.hiveUsername ? `@${entry.author.hiveUsername}` : 'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-foreground">Updated</dt>
                <dd className="mt-1">{new Date(entry.updatedAt).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-foreground">Tags</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {(tags.length ? tags : ['None']).map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function LoreEntryDetailClient({
  entryId,
  initialEntry = null,
  worldId,
}: LoreEntryDetailClientProps) {
  const [entry, setEntry] = useState<LoreEntry | null>(initialEntry);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialEntry);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    if (initialEntry) {
      setEntry(initialEntry);
      setError(null);
      setIsLoading(false);
      setIsMissing(false);
      return;
    }

    let isActive = true;

    async function loadEntry() {
      setError(null);
      setIsLoading(true);
      setIsMissing(false);

      try {
        const accessToken = getStoredAccessToken();
        const response = await getLoreEntry(worldId, entryId, accessToken);

        if (isActive) {
          setEntry(response.entry);
        }
      } catch (nextError) {
        if (isActive) {
          if (nextError instanceof ApiError && nextError.status === 404) {
            setEntry(null);
            setError(null);
            setIsMissing(true);
            return;
          }

          setEntry(null);
          setError(getErrorMessage(nextError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadEntry();

    return () => {
      isActive = false;
    };
  }, [entryId, initialEntry, worldId]);

  if (isMissing) {
    notFound();
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">Loading lore entry...</p>
        </CardContent>
      </Card>
    );
  }

  if (entry) {
    return <LoreEntryContent entry={entry} worldId={worldId} />;
  }

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <AlertTitle>Lore entry unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Link
        className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        href={`/worlds/${worldId}`}
      >
        Back to world
      </Link>
    </div>
  );
}
