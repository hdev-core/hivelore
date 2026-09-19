'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api/errors';
import { listLoreEntries, type LoreEntry } from '@/lib/api/lore';
import { loreCategories, type LoreCategory } from '@/lib/worlds/constants';
import { useAuthSession } from '@/providers/auth-session-provider';

import {
  getEntrySummary,
  getCardEntityTypeFromApiType,
  getLoreTypeFromCategory,
  getLoreTypeLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from './lore-utils';

type LoreEntityTabsProps = {
  fallbackEntries: Array<{
    id: string;
    loreType: string;
    slug: string;
    status: string;
    title: string;
    updatedAt: string;
  }>;
  worldId: string;
};

const defaultCategory: LoreCategory = 'characters';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Lore entity endpoints are not available on this backend branch yet.';
    }

    return error.body?.error ?? 'Unable to load lore entries.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load lore entries.';
}

export function LoreEntityTabs({ fallbackEntries, worldId }: LoreEntityTabsProps) {
  const { accessToken } = useAuthSession();
  const [activeCategory, setActiveCategory] = useState<LoreCategory>(defaultCategory);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadEntries() {
      setError(null);
      setIsLoading(true);

      try {
        const trimmedQuery = query.trim();
        const response = await listLoreEntries(
          worldId,
          {
            ...(trimmedQuery ? { q: trimmedQuery } : {}),
            loreType: getLoreTypeFromCategory(activeCategory),
          },
          accessToken,
        );

        if (isActive) {
          setEntries(response.entries);
        }
      } catch (nextError) {
        if (isActive) {
          setEntries([]);
          setError(getErrorMessage(nextError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadEntries();

    return () => {
      isActive = false;
    };
  }, [accessToken, activeCategory, query, worldId]);

  const visibleFallbackEntries = fallbackEntries.filter(
    (entry) => entry.loreType === getLoreTypeFromCategory(activeCategory),
  );

  return (
    <section aria-labelledby="lore-tabs-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="lore-tabs-heading" className="text-2xl font-semibold tracking-normal">
            Lore entities
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Browse and manage the six structured M2 entity types.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Input
            aria-label="Search lore entries"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lore"
            type="search"
            value={query}
          />
        </div>
      </div>

      <Tabs
        className="mt-4"
        defaultValue={activeCategory}
        onValueChange={(value) => setActiveCategory(value as LoreCategory)}
      >
        <TabsList>
          {loreCategories.map((category) => (
            <TabsTrigger key={category.id} value={category.id}>
              {category.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {loreCategories.map((category) => (
          <TabsContent key={category.id} value={category.id}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isLoading ? (
                <Card>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">Loading entries...</p>
                  </CardContent>
                </Card>
              ) : null}

              {!isLoading && error ? (
                <Alert variant="warning">
                  <AlertTitle>Lore list unavailable</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {!isLoading && !error && entries.length
                ? entries.map((entry) => (
                    <Card key={entry.id}>
                      <CardHeader>
                        <div className="flex flex-wrap gap-2">
                          <Badge>
                            {getLoreTypeLabel(
                              getCardEntityTypeFromApiType(entry.loreType, entry.content),
                            )}
                          </Badge>
                          <Badge variant={getStatusBadgeVariant(entry.status)}>
                            {getStatusLabel(entry.status)}
                          </Badge>
                        </div>
                        <CardTitle>{entry.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {getEntrySummary(entry) || 'No summary yet.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link
                            className="text-sm font-semibold text-[var(--hive-red)] underline-offset-4 hover:underline"
                            href={`/worlds/${worldId}/lore/${entry.id}`}
                          >
                            Open
                          </Link>
                          <Link
                            className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                            href={`/worlds/${worldId}/lore/edit?entryId=${entry.id}`}
                          >
                            Edit
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : null}

              {!isLoading && !error && !entries.length ? (
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{category.label}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          No entries in this type yet.
                        </p>
                      </div>
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        href={`/worlds/${worldId}/lore/edit?type=${category.id}`}
                      >
                        Add {category.label}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {error && visibleFallbackEntries.length
                ? visibleFallbackEntries.map((entry) => (
                    <Card key={entry.id}>
                      <CardHeader>
                        <div className="flex flex-wrap gap-2">
                          <Badge>{getLoreTypeLabel(entry.loreType)}</Badge>
                          <Badge variant={getStatusBadgeVariant(entry.status)}>
                            {getStatusLabel(entry.status)}
                          </Badge>
                        </div>
                        <CardTitle>{entry.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Updated {new Date(entry.updatedAt).toLocaleDateString()}.
                        </p>
                        <Link
                          className="mt-4 inline-flex text-sm font-semibold text-[var(--hive-red)] underline-offset-4 hover:underline"
                          href={`/worlds/${worldId}/lore/${entry.id}`}
                        >
                          Open entry
                        </Link>
                      </CardContent>
                    </Card>
                  ))
                : null}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
