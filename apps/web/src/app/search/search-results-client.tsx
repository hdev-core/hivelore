'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { GlobalSearchForm } from '@/components/layout/global-search-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api/errors';
import { searchWorldLore, type SearchResult } from '@/lib/api/search';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Unable to search HiveLore.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to search HiveLore.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringMetadata(result: SearchResult, key: string) {
  if (!isRecord(result.metadata)) {
    return null;
  }

  const value = result.metadata[key];
  return typeof value === 'string' && value ? value : null;
}

function getResultHref(result: SearchResult) {
  if (result.entityType === 'WORLD') {
    return `/worlds/${result.entityId}`;
  }

  if (result.worldId) {
    return `/worlds/${result.worldId}/lore/${result.entityId}`;
  }

  return null;
}

function getResultTypeLabel(result: SearchResult) {
  if (result.entityType === 'WORLD') {
    return 'World';
  }

  return getStringMetadata(result, 'loreType')?.toLowerCase().replaceAll('_', ' ') ?? 'Lore';
}

type SearchResultsClientProps = {
  initialQuery: string;
};

export function SearchResultsClient({ initialQuery }: SearchResultsClientProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const normalizedQuery = useMemo(() => initialQuery.trim(), [initialQuery]);

  useEffect(() => {
    if (!normalizedQuery) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    setIsLoading(true);
    setError(null);

    searchWorldLore({ q: normalizedQuery })
      .then((response) => {
        if (isMounted) {
          setResults(response.results);
        }
      })
      .catch((nextError) => {
        if (isMounted) {
          setError(getErrorMessage(nextError));
          setResults([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [normalizedQuery]);

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Global search
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            Search worlds and published lore.
          </h1>
        </div>
        <GlobalSearchForm className="max-w-2xl" initialQuery={initialQuery} inputClassName="h-12" />
      </section>

      {error ? (
        <Alert variant="danger">
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="search-results-heading" className="space-y-4">
        <div>
          <h2 id="search-results-heading" className="text-2xl font-semibold tracking-normal">
            Results
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isLoading
              ? 'Searching...'
              : normalizedQuery
                ? `${results.length} result${results.length === 1 ? '' : 's'} for "${normalizedQuery}".`
                : 'Enter a search term to find matching worlds and canon lore.'}
          </p>
        </div>

        {!isLoading && normalizedQuery && results.length === 0 && !error ? (
          <Card>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                No matching worlds or published lore entries found.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {results.map((result) => {
            const href = getResultHref(result);
            const content = (
              <Card className="h-full transition-colors hover:border-[var(--hive-red)]">
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{getResultTypeLabel(result)}</Badge>
                    {result.entityType === 'LORE_ENTRY' ? (
                      <Badge variant="canon">Canon</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl">{result.title}</CardTitle>
                  <CardDescription>
                    {result.entityType === 'WORLD' ? 'World match' : 'Published lore entry match'}
                  </CardDescription>
                </CardHeader>
              </Card>
            );

            return href ? (
              <Link
                className="rounded-panel focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href={href}
                key={`${result.entityType}-${result.entityId}`}
              >
                {content}
              </Link>
            ) : (
              <div key={`${result.entityType}-${result.entityId}`}>{content}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
