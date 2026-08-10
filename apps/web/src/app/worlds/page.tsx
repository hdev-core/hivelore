'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { ApiError } from '@/lib/api/errors';
import { listWorlds, type WorldsPagination, type WorldSummary } from '@/lib/api/worlds';
import { cn } from '@/lib/styles';
import { quickFilters } from '@/lib/worlds/constants';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Unable to load worlds.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load worlds.';
}

export default function WorldsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<WorldsPagination>({
    page: 1,
    pageSize: 24,
    total: 0,
  });
  const [query, setQuery] = useState('');
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, query]);

  useEffect(() => {
    let isMounted = true;
    const searchQuery = query.trim();

    setIsLoading(true);
    setError(null);

    listWorlds({
      ...(activeFilter !== 'all' ? { genre: activeFilter } : {}),
      page,
      pageSize: pagination.pageSize,
      ...(searchQuery ? { q: searchQuery } : {}),
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setPagination(response.pagination);
        setWorlds(response.worlds);
      })
      .catch((nextError) => {
        if (!isMounted) {
          return;
        }

        setError(getErrorMessage(nextError));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeFilter, page, pagination.pageSize, query]);

  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            World discovery
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            Browse active HiveLore worlds.
          </h1>
          <p className="prose-text mt-5 max-w-2xl">
            Compare tone, canon foundation, and current world seeds before choosing where to read or
            contribute.
          </p>
        </div>
        <div className="flex items-start lg:justify-end">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-control border border-[var(--hive-red)] bg-[var(--hive-red)] px-5 text-base font-semibold text-white shadow-soft transition-colors hover:bg-[color-mix(in_srgb,var(--hive-red)_88%,black)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            href="/worlds/new"
          >
            Create New World
          </Link>
        </div>
      </section>

      <section aria-label="World search and filters" className="space-y-4">
        <Card>
          <CardContent className="grid items-start gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              <span className="min-h-5 leading-5">Search worlds</span>
              <SearchInput
                className="h-12"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or description"
                value={query}
              />
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <button
            className={cn(
              'min-h-9 rounded-control border px-3 text-sm font-semibold transition-colors',
              activeFilter === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground hover:bg-muted',
            )}
            onClick={() => setActiveFilter('all')}
            type="button"
          >
            All
          </button>
          {quickFilters.map((filter) => (
            <button
              className={cn(
                'min-h-9 rounded-control border px-3 text-sm font-semibold capitalize transition-colors',
                activeFilter === filter
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface text-foreground hover:bg-muted',
              )}
              key={filter}
              onClick={() => setActiveFilter(filter)}
              type="button"
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <Alert variant="danger">
          <AlertTitle>Worlds could not load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="world-results-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="world-results-heading" className="text-2xl font-semibold tracking-normal">
              Worlds
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {isLoading
                ? 'Loading worlds...'
                : `Showing ${worlds.length} of ${pagination.total} worlds.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="min-h-9 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              type="button"
            >
              Previous
            </button>
            <span className="min-w-20 text-center text-sm font-semibold text-muted-foreground">
              {pagination.page} / {pageCount}
            </span>
            <button
              className="min-h-9 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              disabled={page >= pageCount || isLoading}
              onClick={() => setPage((currentPage) => Math.min(pageCount, currentPage + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>

        {!isLoading && worlds.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                No worlds match this view yet. Adjust the filters or create the first world seed.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {worlds.map((world) => (
            <Link
              className="group rounded-panel focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              href={`/worlds/${world.id}`}
              key={world.id}
            >
              <Card className="h-full transition-colors group-hover:border-[var(--hive-red)]">
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{world.seed?.genre ?? 'World'}</Badge>
                    {world.currentBibleVersion ? (
                      <Badge variant="canon">
                        Bible v{world.currentBibleVersion.versionNumber}
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl">{world.title}</CardTitle>
                  <CardDescription>{world.seed?.tone ?? 'Tone pending'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{world.description}</p>
                  <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Founder</dt>
                      <dd className="mt-1 font-semibold">@{world.founder.hiveUsername}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Seed</dt>
                      <dd className="mt-1 font-semibold">{world.seed ? 'Ready' : 'Draft'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd className="mt-1 font-semibold">
                        {new Date(world.updatedAt).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
