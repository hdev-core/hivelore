'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api/errors';
import { listWorlds, type WorldSort, type WorldSummary } from '@/lib/api/worlds';
import { cn } from '@/lib/styles';
import { quickFilters } from '@/lib/worlds/constants';

const sortLabels: Record<WorldSort, string> = {
  newest: 'Newest',
  'most-active': 'Most active',
  'highest-reputation': 'Highest reputation',
  'most-canon': 'Most canon entries',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Unable to load worlds.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load worlds.';
}

function getFounderName(world: WorldSummary) {
  return world.founder.displayName || world.founder.hiveUsername;
}

function sortWorlds(worlds: WorldSummary[], sort: WorldSort) {
  return [...worlds].sort((left, right) => {
    if (sort === 'newest') {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (sort === 'most-active') {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (sort === 'highest-reputation') {
      return getFounderName(left).localeCompare(getFounderName(right));
    }

    return (
      (right.currentBibleVersion?.versionNumber ?? 0) -
      (left.currentBibleVersion?.versionNumber ?? 0)
    );
  });
}

export default function WorldsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WorldSort>('most-active');
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    listWorlds()
      .then((response) => {
        if (!isMounted) {
          return;
        }

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
  }, []);

  const filteredWorlds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortWorlds(worlds, sort).filter((world) => {
      const genre = world.seed?.genre ?? '';
      const tone = world.seed?.tone ?? '';
      const matchesFilter = activeFilter === 'all' || genre.toLowerCase() === activeFilter;
      const searchableText = [
        world.title,
        world.description,
        genre,
        tone,
        getFounderName(world),
        world.seed?.premise,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, query, sort, worlds]);

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
          <CardContent className="grid items-start gap-4 md:grid-cols-[1fr_15rem]">
            <label className="grid gap-2 text-sm font-semibold">
              <span className="min-h-5 leading-5">Search worlds</span>
              <SearchInput
                className="h-12"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, genre, founder, or tone"
                value={query}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="min-h-5 leading-5">Sort</span>
              <Select
                className="h-12"
                onChange={(event) => setSort(event.target.value as WorldSort)}
                value={sort}
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
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
                : `Showing ${filteredWorlds.length} of ${worlds.length} worlds.`}
            </p>
          </div>
        </div>

        {!isLoading && filteredWorlds.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                No worlds match this view yet. Adjust the filters or create the first world seed.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {filteredWorlds.map((world) => (
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
