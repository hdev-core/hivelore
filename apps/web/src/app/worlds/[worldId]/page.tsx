import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoreEntityTabs } from '@/components/lore/lore-entity-tabs';
import { ApiError } from '@/lib/api/errors';
import { getWorldHub, type WorldHub } from '@/lib/api/worlds';

type WorldPageProps = {
  params: Promise<{ worldId: string }>;
};

function getBibleRules(content: unknown) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return [];
  }

  const rules = (content as { rules?: unknown }).rules;

  if (Array.isArray(rules)) {
    return rules.filter(
      (rule): rule is string => typeof rule === 'string' && rule.trim().length > 0,
    );
  }

  const guidance = (content as { guidance?: unknown }).guidance;

  return typeof guidance === 'string' && guidance.trim() ? [guidance.trim()] : [];
}

async function loadWorldHub(worldId: string) {
  try {
    return await getWorldHub(worldId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

function WorldHubContent({ hub }: { hub: WorldHub }) {
  const { latestLoreEntries, stats, world } = hub;
  const seed = world.seed;
  const bibleRules = getBibleRules(world.currentBibleVersion?.content);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{seed?.genre ?? 'World'}</Badge>
            <Badge variant="canon">{stats.canonLoreCount} canon entries</Badge>
            <Badge variant={stats.activeProposalCount ? 'proposal' : 'neutral'}>
              {stats.activeProposalCount} active proposals
            </Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-normal text-foreground">
            {world.title}
          </h1>
          <p className="mt-3 text-lg leading-8 text-muted-foreground">{world.description}</p>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Tone</dt>
              <dd className="mt-1 text-foreground">{seed?.tone ?? 'Not set'}</dd>
            </div>
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Founder</dt>
              <dd className="mt-1 text-foreground">@{world.founder.hiveUsername}</dd>
            </div>
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Main conflict</dt>
              <dd className="mt-1 text-foreground">{seed?.mainConflict ?? 'Not set'}</dd>
            </div>
          </dl>
        </div>
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Next actions</CardTitle>
            <CardDescription>Read, vote, or contribute inside this world.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              className="inline-flex min-h-10 w-full items-center justify-center rounded-control border border-[var(--hive-red)] bg-[var(--hive-red)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--hive-red)_88%,black)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              href={`/worlds/${world.id}/contribute`}
            >
              Create Lore Entry
            </Link>
            <Link
              className="inline-flex min-h-10 w-full items-center justify-center rounded-control border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              href={`/worlds/${world.id}/contribute?type=stories`}
            >
              Write Story Contribution
            </Link>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Button variant="outline">View Timeline</Button>
              <Button variant="outline">View Map</Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>World Seed</CardTitle>
            <CardDescription>Foundation lore accepted when the world was created.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">Premise</dt>
                <dd className="mt-1 leading-6">{seed?.premise ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">Starting location</dt>
                <dd className="mt-1 leading-6">{seed?.startingLocation ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  First historical event
                </dt>
                <dd className="mt-1 leading-6">{seed?.firstHistoricalEvent ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">Bible version</dt>
                <dd className="mt-1 leading-6">
                  {world.currentBibleVersion
                    ? `Version ${world.currentBibleVersion.versionNumber}`
                    : 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">First characters</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {(seed?.firstCharacters.length ? seed.firstCharacters : ['None yet']).map(
                    (character) => (
                      <Badge key={character}>{character}</Badge>
                    ),
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">First factions</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {(seed?.firstFactions.length ? seed.firstFactions : ['None yet']).map(
                    (faction) => (
                      <Badge key={faction}>{faction}</Badge>
                    ),
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Canon status</CardTitle>
            <CardDescription>Quick health read before users contribute.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-b border-border pb-3">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm font-semibold text-muted-foreground">Canon entries</dt>
                <dd className="text-lg font-semibold">{stats.canonLoreCount}</dd>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Published canon indexed for this world.
              </p>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm font-semibold text-muted-foreground">Proposal queue</dt>
                <dd className="text-lg font-semibold">{stats.activeProposalCount}</dd>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Submitted or voting proposals currently active.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>World Codex preview</CardTitle>
            <CardDescription>Contributor-facing rules that ground AI checks.</CardDescription>
          </CardHeader>
          <CardContent>
            {bibleRules.length ? (
              <ul className="space-y-3">
                {bibleRules.map((rule) => (
                  <li className="flex gap-3 text-sm leading-6" key={rule}>
                    <span
                      aria-hidden="true"
                      className="mt-2 size-2 shrink-0 rounded-full bg-[var(--hive-red)]"
                    />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                This world bible does not expose readable rules yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card variant="muted">
          <CardHeader>
            <CardTitle>Ask about this world</CardTitle>
            <CardDescription>
              AI guide panel placeholder for summaries, contradictions, and contribution guidance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="secondary">
              Ask AI Guide
            </Button>
          </CardContent>
        </Card>
      </section>

      <LoreEntityTabs fallbackEntries={latestLoreEntries} worldId={world.id} />

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Latest canon</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Published entries returned by the world hub endpoint.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {latestLoreEntries.length ? (
              latestLoreEntries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{entry.loreType.replaceAll('_', ' ')}</Badge>
                      <Badge variant="canon">{entry.status.replaceAll('_', ' ')}</Badge>
                    </div>
                    <CardTitle>{entry.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Updated {new Date(entry.updatedAt).toLocaleDateString()}.
                    </p>
                    <Link
                      className="mt-4 inline-flex text-sm font-semibold text-[var(--hive-red)] underline-offset-4 hover:underline"
                      href={`/worlds/${world.id}/lore/${entry.id}`}
                    >
                      Open entry
                    </Link>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Alert>
                <AlertTitle>No canon entries yet</AlertTitle>
                <AlertDescription>
                  Create the first structured lore contribution to start filling this hub.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Pending proposals</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Contributions that need review or votes.
            </p>
          </div>
          <Card>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {stats.activeProposalCount
                  ? `${stats.activeProposalCount} active proposals are available through the backend summary.`
                  : 'No active proposals. This is a good moment to add structured lore.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

export default async function WorldPage({ params }: WorldPageProps) {
  const { worldId } = await params;
  const hub = await loadWorldHub(worldId);

  return <WorldHubContent hub={hub} />;
}
