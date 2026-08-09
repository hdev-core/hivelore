import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/errors';
import { getLoreEntry, type LoreEntry } from '@/lib/api/lore';
import {
  getEntryBody,
  getEntryFields,
  getEntrySummary,
  getEntryTags,
  getCardEntityTypeFromApiType,
  getLoreTypeLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/components/lore/lore-utils';

type LoreEntryPageProps = {
  params: Promise<{ entryId: string; worldId: string }>;
};

async function loadLoreEntry(worldId: string, entryId: string) {
  try {
    const response = await getLoreEntry(worldId, entryId);

    return { entry: response.entry, error: null };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return {
      entry: null,
      error:
        error instanceof ApiError
          ? (error.body?.error ?? 'Lore entry could not be loaded.')
          : 'Lore entry could not be loaded.',
    };
  }
}

function LoreEntryContent({ entry, worldId }: { entry: LoreEntry; worldId: string }) {
  const body = getEntryBody(entry);
  const fields = getEntryFields(entry);
  const tags = getEntryTags(entry);
  const outgoingRelations = entry.outgoingRelations ?? [];
  const incomingRelations = entry.incomingRelations ?? [];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
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
        </div>
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
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {body ? (
              <p className="prose-text max-w-none whitespace-pre-wrap">{body}</p>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">No description yet.</p>
            )}
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
      </section>

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
                      <Link
                        className="text-[var(--hive-red)] underline-offset-4 hover:underline"
                        href={`/worlds/${worldId}/lore/${relationship.target.id}`}
                      >
                        {relationship.target.title}
                      </Link>
                    ) : (
                      'Unknown entry'
                    )}
                  </li>
                ))}
                {incomingRelations.map((relationship) => (
                  <li className="text-sm leading-6" key={relationship.id}>
                    {relationship.source ? (
                      <Link
                        className="text-[var(--hive-red)] underline-offset-4 hover:underline"
                        href={`/worlds/${worldId}/lore/${relationship.source.id}`}
                      >
                        {relationship.source.title}
                      </Link>
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
    </div>
  );
}

export default async function LoreEntryPage({ params }: LoreEntryPageProps) {
  const { entryId, worldId } = await params;
  const { entry, error } = await loadLoreEntry(worldId, entryId);

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
