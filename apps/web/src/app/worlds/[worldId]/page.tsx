import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWorldById, loreCategories } from '@/lib/worlds/mock-worlds';

type WorldPageProps = {
  params: Promise<{ worldId: string }>;
};

export default async function WorldPage({ params }: WorldPageProps) {
  const { worldId } = await params;
  const world = getWorldById(worldId);

  if (!world) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{world.genre}</Badge>
            <Badge variant="canon">{world.canonEntries} canon entries</Badge>
            <Badge variant={world.activeProposals ? 'proposal' : 'neutral'}>
              {world.activeProposals} active proposals
            </Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-normal text-foreground">
            {world.title}
          </h1>
          <p className="mt-3 text-lg leading-8 text-muted-foreground">{world.summary}</p>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Tone</dt>
              <dd className="mt-1 text-foreground">{world.tone}</dd>
            </div>
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Founder</dt>
              <dd className="mt-1 text-foreground">@{world.founder}</dd>
            </div>
            <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
              <dt className="font-semibold text-muted-foreground">Main conflict</dt>
              <dd className="mt-1 text-foreground">{world.mainConflict}</dd>
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
              href={`/worlds/${world.id}/contribute?type=story`}
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
                <dt className="text-sm font-semibold text-muted-foreground">Starting location</dt>
                <dd className="mt-1 leading-6">{world.seed.location}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  First historical event
                </dt>
                <dd className="mt-1 leading-6">{world.seed.firstEvent}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">First characters</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {world.seed.characters.map((character) => (
                    <Badge key={character}>{character}</Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">First factions</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {world.seed.factions.map((faction) => (
                    <Badge key={faction}>{faction}</Badge>
                  ))}
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
            {world.canonHealth.map((item) => (
              <div className="border-b border-border pb-3 last:border-0 last:pb-0" key={item.label}>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm font-semibold text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-semibold">{item.value}</dd>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
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
            <ul className="space-y-3">
              {world.codexPreview.map((rule) => (
                <li className="flex gap-3 text-sm leading-6" key={rule}>
                  <span
                    aria-hidden="true"
                    className="mt-2 size-2 shrink-0 rounded-full bg-[var(--hive-red)]"
                  />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
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

      <section aria-labelledby="lore-tabs-heading">
        <h2 id="lore-tabs-heading" className="text-2xl font-semibold tracking-normal">
          Canon entries
        </h2>
        <Tabs className="mt-4" defaultValue="characters">
          <TabsList>
            {loreCategories.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {loreCategories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              <Card>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{category.label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {world.categoryCounts[category.id]} entries in this world.
                      </p>
                    </div>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      href={`/worlds/${world.id}/contribute?type=${category.id}`}
                    >
                      Add {category.label}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Featured canon</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Reading endpoints that show the world identity quickly.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {world.featuredCanon.map((entry) => (
              <Card key={entry.id}>
                <CardHeader>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{entry.type}</Badge>
                    <Badge variant={entry.status}>{entry.status?.replaceAll('-', ' ')}</Badge>
                  </div>
                  <CardTitle>{entry.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{entry.summary}</p>
                  <Link
                    className="mt-4 inline-flex text-sm font-semibold text-[var(--hive-red)] underline-offset-4 hover:underline"
                    href={`/worlds/${world.id}/lore/${entry.id}`}
                  >
                    Open entry
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Pending proposals</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Contributions that need review or votes.
            </p>
          </div>
          <div className="space-y-4">
            {world.pendingProposals.length > 0 ? (
              world.pendingProposals.map((proposal) => (
                <Card key={proposal.id}>
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="proposal">Proposal</Badge>
                      {proposal.hasAiWarning ? (
                        <Badge variant="ai-warning">AI Warning</Badge>
                      ) : null}
                    </div>
                    <CardTitle>{proposal.title}</CardTitle>
                    <CardDescription>By @{proposal.author}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Votes</dt>
                        <dd className="mt-1 font-semibold">{proposal.voteCount}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Approval</dt>
                        <dd className="mt-1 font-semibold">{proposal.approvalPercent}%</dd>
                      </div>
                    </dl>
                    <Link
                      className="mt-4 inline-flex text-sm font-semibold text-[var(--hive-red)] underline-offset-4 hover:underline"
                      href={`/worlds/${world.id}/proposals/${proposal.id}`}
                    >
                      Review proposal
                    </Link>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    No active proposals. This is a good moment to add structured lore.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
