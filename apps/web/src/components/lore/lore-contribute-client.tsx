'use client';

import { useEffect, useState } from 'react';

import { LoreEntryForm } from '@/components/lore/lore-entry-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/errors';
import { getLoreEntry, type LoreEntry } from '@/lib/api/lore';
import { getStoredAccessToken } from '@/lib/api/session';
import type { LoreType } from '@/lib/worlds/constants';

import { getLoreTypeFromQuery } from './lore-utils';

type LoreContributeClientProps = {
  entryId?: string | undefined;
  type?: string | undefined;
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

export function LoreContributeClient({ entryId, type, worldId }: LoreContributeClientProps) {
  const [entry, setEntry] = useState<LoreEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(entryId));
  const initialType: LoreType = entry?.loreType ?? getLoreTypeFromQuery(type);

  useEffect(() => {
    if (!entryId) {
      setEntry(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    const currentEntryId = entryId;

    async function loadEntry() {
      setError(null);
      setIsLoading(true);

      try {
        const accessToken = getStoredAccessToken();
        const response = await getLoreEntry(worldId, currentEntryId, accessToken);

        if (isActive) {
          setEntry(response.entry);
        }
      } catch (nextError) {
        if (isActive) {
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
  }, [entryId, worldId]);

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

      {isLoading ? (
        <Alert>
          <AlertTitle>Loading entry</AlertTitle>
          <AlertDescription>Preparing the lore editor.</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="warning">
          <AlertTitle>Entry was not loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!isLoading ? (
        <LoreEntryForm
          entry={entry}
          initialType={initialType}
          mode={entry ? 'edit' : 'create'}
          worldId={worldId}
        />
      ) : null}
    </div>
  );
}
