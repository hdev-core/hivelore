'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/errors';
import { createWorld } from '@/lib/api/worlds';
import { useAuthSession } from '@/providers/auth-session-provider';

const starterCharacters = ['Founder heir', 'Rival witness', 'Guide or chronicler'];
const starterFactions = ['Founder circle', 'Opposing faction', 'Neutral civic group'];

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Unable to create world.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to create world.';
}

export default function NewWorldPage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [firstCharacters, setFirstCharacters] = useState('');
  const [firstFactions, setFirstFactions] = useState('');
  const [firstHistoricalEvent, setFirstHistoricalEvent] = useState('');
  const [genre, setGenre] = useState('Political Fantasy');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mainConflict, setMainConflict] = useState('');
  const [premise, setPremise] = useState('');
  const [startingLocation, setStartingLocation] = useState('');
  const [title, setTitle] = useState('');
  const [tone, setTone] = useState('');
  const [worldRules, setWorldRules] = useState('');
  const { accessToken, isSessionLoading, user } = useAuthSession();

  useEffect(() => {
    if (!isSessionLoading && !accessToken) {
      router.replace('/login');
    }
  }, [accessToken, isSessionLoading, router]);

  const canSubmit = useMemo(
    () =>
      title.trim() &&
      description.trim() &&
      premise.trim() &&
      genre.trim() &&
      tone.trim() &&
      mainConflict.trim() &&
      worldRules.trim() &&
      Boolean(accessToken) &&
      !isSubmitting,
    [accessToken, description, genre, isSubmitting, mainConflict, premise, title, tone, worldRules],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!accessToken) {
      setError('Please sign in before creating a world.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createWorld(
        {
          bible: {
            changeSummary: 'Initial world bible.',
            content: {
              guidance: worldRules.trim(),
              rules: linesToList(worldRules),
              seed: {
                firstCharacters: linesToList(firstCharacters),
                firstFactions: linesToList(firstFactions),
                firstHistoricalEvent: firstHistoricalEvent.trim() || null,
                mainConflict: mainConflict.trim(),
                premise: premise.trim(),
                startingLocation: startingLocation.trim() || null,
              },
            },
          },
          description: description.trim(),
          seed: {
            firstCharacters: linesToList(firstCharacters),
            firstFactions: linesToList(firstFactions),
            ...(firstHistoricalEvent.trim()
              ? { firstHistoricalEvent: firstHistoricalEvent.trim() }
              : {}),
            genre: genre.trim(),
            mainConflict: mainConflict.trim(),
            premise: premise.trim(),
            ...(startingLocation.trim() ? { startingLocation: startingLocation.trim() } : {}),
            tone: tone.trim(),
          },
          title: title.trim(),
        },
        accessToken,
      );

      router.push(`/worlds/${response.world.id}`);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

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

      {error ? (
        <Alert variant="danger">
          <AlertTitle>World was not created</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
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
                  <Input
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="The Ember Crown"
                    required
                    value={title}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Genre
                  <Select onChange={(event) => setGenre(event.target.value)} required value={genre}>
                    <option value="Fantasy">Fantasy</option>
                    <option value="Sci-Fi">Sci-Fi</option>
                    <option value="Political Fantasy">Political Fantasy</option>
                    <option value="Dark Fantasy">Dark Fantasy</option>
                    <option value="Mystery">Mystery</option>
                    <option value="Adventure">Adventure</option>
                  </Select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Tone
                  <Input
                    onChange={(event) => setTone(event.target.value)}
                    placeholder="Tense, mythic, hopeful"
                    required
                    value={tone}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Starting location
                  <Input
                    onChange={(event) => setStartingLocation(event.target.value)}
                    placeholder="Capital city, frontier station, haunted crossing"
                    value={startingLocation}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                  Public description
                  <Textarea
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="A short description shown on browse and hub pages."
                    required
                    rows={3}
                    value={description}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                  Premise
                  <Textarea
                    onChange={(event) => setPremise(event.target.value)}
                    placeholder="What is the world about?"
                    required
                    rows={4}
                    value={premise}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                  Main conflict
                  <Textarea
                    onChange={(event) => setMainConflict(event.target.value)}
                    placeholder="What tension makes this world worth joining?"
                    required
                    rows={4}
                    value={mainConflict}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                  World rules
                  <Textarea
                    onChange={(event) => setWorldRules(event.target.value)}
                    placeholder="Magic limits, technology constraints, continuity rules, writing style..."
                    required
                    rows={5}
                    value={worldRules}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  First characters
                  <Textarea
                    onChange={(event) => setFirstCharacters(event.target.value)}
                    placeholder="One character per line"
                    rows={4}
                    value={firstCharacters}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  First factions
                  <Textarea
                    onChange={(event) => setFirstFactions(event.target.value)}
                    placeholder="One faction per line"
                    rows={4}
                    value={firstFactions}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                  First historical event
                  <Textarea
                    onChange={(event) => setFirstHistoricalEvent(event.target.value)}
                    placeholder="The event that launches the shared canon."
                    rows={4}
                    value={firstHistoricalEvent}
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>World Seed summary</CardTitle>
                <CardDescription>
                  Preview structure for the first public world page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="font-semibold">Starter characters</dt>
                    <dd className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                      {(linesToList(firstCharacters).length
                        ? linesToList(firstCharacters)
                        : starterCharacters
                      ).map((item) => (
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
                      {(linesToList(firstFactions).length
                        ? linesToList(firstFactions)
                        : starterFactions
                      ).map((item) => (
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
                      Seed becomes starter canon. Later entries are proposals until the community
                      vote threshold is met.
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
              The initial World Bible guides contributors and feeds AI consistency checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button disabled={!canSubmit} isLoading={isSubmitting} type="submit" variant="hive">
                Create World
              </Button>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-transparent bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href="/worlds"
              >
                Back to Worlds
              </Link>
              {!user ? (
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  href="/login"
                >
                  Sign in
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
