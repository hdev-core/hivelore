import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const starterCharacters = ['Founder heir', 'Rival witness', 'Guide or chronicler'];
const starterFactions = ['Founder circle', 'Opposing faction', 'Neutral civic group'];

export default function NewWorldPage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Founder setup
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            Create a world seed and bible.
          </h1>
          <p className="prose-text mt-5 max-w-2xl">
            Give contributors enough structure to understand the world, write inside its rules, and
            start building canon through the community loop.
          </p>
        </div>
        <Card variant="muted">
          <CardHeader>
            <CardTitle>Starter canon</CardTitle>
            <CardDescription>
              The founder creates the first layer, then canon decisions move through votes and AI
              checks.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>World Seed</CardTitle>
            <CardDescription>
              Structured fields for the world identity, first conflict, and initial lore anchors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                World name
                <Input placeholder="The Ember Crown" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Genre
                <Select defaultValue="political-fantasy">
                  <option value="fantasy">Fantasy</option>
                  <option value="sci-fi">Sci-Fi</option>
                  <option value="political-fantasy">Political Fantasy</option>
                  <option value="dark-fantasy">Dark Fantasy</option>
                  <option value="mystery">Mystery</option>
                  <option value="adventure">Adventure</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Tone
                <Input placeholder="Tense, mythic, hopeful" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Starting location
                <Input placeholder="Capital city, frontier station, haunted crossing" />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Main conflict
                <Textarea placeholder="What tension makes this world worth joining?" rows={4} />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                World rules
                <Textarea
                  placeholder="Magic limits, technology constraints, continuity rules, writing style..."
                  rows={5}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                First characters
                <Textarea placeholder="One character per line" rows={4} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                First factions
                <Textarea placeholder="One faction per line" rows={4} />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                First historical event
                <Textarea placeholder="The event that launches the shared canon." rows={4} />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>World Seed summary</CardTitle>
              <CardDescription>Preview structure for the first public world page.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-semibold">Starter characters</dt>
                  <dd className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                    {starterCharacters.map((item) => (
                      <span
                        className="rounded-control border border-border bg-surface px-2 py-1"
                        key={item}
                      >
                        {item}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Starter factions</dt>
                  <dd className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                    {starterFactions.map((item) => (
                      <span
                        className="rounded-control border border-border bg-surface px-2 py-1"
                        key={item}
                      >
                        {item}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Canon path</dt>
                  <dd className="mt-1 leading-6 text-muted-foreground">
                    Seed becomes starter canon. Later entries are proposals until the community vote
                    threshold is met.
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Alert variant="warning">
            <AlertTitle>Founder note</AlertTitle>
            <AlertDescription>
              Founders define the starting canon, but later canon decisions depend on community
              voting and AI consistency checks.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>World Codex</CardTitle>
          <CardDescription>
            Placeholder for the rich World Bible editor that will guide contributors and feed AI
            consistency checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Write tone rules, continuity constraints, naming conventions, accepted foundation lore, and contribution guidance..."
            rows={8}
          />
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline">Save Draft World</Button>
            <Button variant="hive">Create World</Button>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-control border border-transparent bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              href="/worlds"
            >
              Back to Worlds
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
