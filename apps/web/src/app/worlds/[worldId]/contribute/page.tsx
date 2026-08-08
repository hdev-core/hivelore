import { notFound } from 'next/navigation';

import { LoreEntryForm } from '@/components/lore/lore-entry-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/errors';
import { getLoreEntry, type LoreEntry } from '@/lib/api/lore';
import { getLoreTypeFromQuery } from '@/components/lore/lore-utils';

type ContributePageProps = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ entryId?: string; type?: string }>;
};

async function loadEntry(worldId: string, entryId?: string) {
  if (!entryId) {
    return { entry: null, error: null };
  }

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

export default async function ContributePage({ params, searchParams }: ContributePageProps) {
  const { worldId } = await params;
  const query = await searchParams;
  const { entry, error } = await loadEntry(worldId, query.entryId);
  const initialType = getLoreTypeFromQuery(query.type);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          World {worldId}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
          {entry ? 'Edit lore entity' : 'Create lore entity'}
        </h1>
        <p className="prose-text mt-5 max-w-2xl">
          Build structured entries for characters, locations, factions, events, artifacts, and
          history.
        </p>
      </section>

      {error ? (
        <Alert variant="warning">
          <AlertTitle>Entry was not loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <LoreEntryForm
        entry={entry as LoreEntry | null}
        initialType={entry?.loreType ?? initialType}
        mode={entry ? 'edit' : 'create'}
        worldId={worldId}
      />
    </div>
  );
}
