'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/styles';
import { quickFilters, worlds, type WorldSort } from '@/lib/worlds/mock-worlds';

const sortLabels: Record<WorldSort, string> = {
  newest: 'Newest',
  'most-active': 'Most active',
  'highest-reputation': 'Highest reputation',
  'most-canon': 'Most canon entries',
};

function sortWorlds(sort: WorldSort) {
  return [...worlds].sort((left, right) => {
    if (sort === 'newest') {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (sort === 'most-active') {
      return right.activityScore - left.activityScore;
    }

    if (sort === 'highest-reputation') {
      return right.founderReputation - left.founderReputation;
    }

    return right.canonEntries - left.canonEntries;
  });
}

export default function WorldsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WorldSort>('most-active');

  const filteredWorlds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortWorlds(sort).filter((world) => {
      const matchesFilter = activeFilter === 'all' || world.tags.includes(activeFilter);
      const searchableText = [
        world.title,
        world.genre,
        world.tone,
        world.founder,
        world.summary,
        ...world.tags,
      ]
        .join(' ')
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, query, sort]);

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
            Compare tone, activity, canon size, and current proposal queues before choosing where to
            read, vote, or contribute.
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

      <section aria-labelledby="world-results-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="world-results-heading" className="text-2xl font-semibold tracking-normal">
              Worlds
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Showing {filteredWorlds.length} of {worlds.length} worlds.
            </p>
          </div>
        </div>

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
                    <Badge>{world.genre}</Badge>
                    {world.activeProposals > 0 ? (
                      <Badge variant="proposal">{world.activeProposals} active votes</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl">{world.title}</CardTitle>
                  <CardDescription>{world.tone}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{world.summary}</p>
                  <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Founder</dt>
                      <dd className="mt-1 font-semibold">@{world.founder}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Canon</dt>
                      <dd className="mt-1 font-semibold">{world.canonEntries}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Rep</dt>
                      <dd className="mt-1 font-semibold">{world.founderReputation}</dd>
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
