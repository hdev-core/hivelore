import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api/errors';
import { getUserProfile } from '@/lib/api/profiles';

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  let profile: Awaited<ReturnType<typeof getUserProfile>>;

  try {
    profile = await getUserProfile(username);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <Alert variant="danger">
        <AlertTitle>Profile could not load</AlertTitle>
        <AlertDescription>
          {error instanceof ApiError
            ? (error.body?.error ?? 'Unable to load this profile.')
            : 'Unable to load this profile.'}
        </AlertDescription>
      </Alert>
    );
  }

  const displayName = profile.user.displayName ?? profile.user.hiveUsername;
  const totalActivity =
    profile.history.contributions.length +
    profile.history.loreEntries.length +
    profile.history.votes.length;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Contributor profile
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            {displayName}
          </h1>
          <p className="prose-text mt-3">@{profile.user.hiveUsername}</p>
          {profile.user.bio ? (
            <p className="prose-text mt-5 max-w-2xl">{profile.user.bio}</p>
          ) : null}
        </div>

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Reputation</CardTitle>
            <CardDescription>Recognition only; voting weight is unchanged.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-semibold tracking-normal">{profile.reputation.score}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="canon">{profile.reputation.level.badge}</Badge>
              {profile.reputation.level.nextScore ? (
                <Badge variant="neutral">Next at {profile.reputation.level.nextScore}</Badge>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {profile.reputation.calculatedAt
                ? `Updated ${new Date(profile.reputation.calculatedAt).toLocaleDateString()}`
                : 'No reputation snapshot yet.'}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Contributions</p>
            <p className="mt-2 text-3xl font-semibold">{profile.history.contributions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Canon entries</p>
            <p className="mt-2 text-3xl font-semibold">{profile.history.loreEntries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Votes</p>
            <p className="mt-2 text-3xl font-semibold">{profile.history.votes.length}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ProfileList title="Contribution history">
          {profile.history.contributions.map((contribution) => (
            <li className="rounded-panel border border-border bg-surface p-4" key={contribution.id}>
              <div className="flex flex-wrap gap-2">
                <Badge>{contribution.kind}</Badge>
                <Badge variant={contribution.status === 'SUBMITTED' ? 'proposal' : 'neutral'}>
                  {contribution.status}
                </Badge>
              </div>
              <h2 className="mt-3 text-lg font-semibold tracking-normal">{contribution.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  className="font-semibold text-foreground hover:underline"
                  href={`/worlds/${contribution.world.id}`}
                >
                  {contribution.world.title}
                </Link>{' '}
                · updated {new Date(contribution.updatedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ProfileList>

        <ProfileList title="Canon entries">
          {profile.history.loreEntries.map((entry) => (
            <li className="rounded-panel border border-border bg-surface p-4" key={entry.id}>
              <div className="flex flex-wrap gap-2">
                <Badge>{entry.loreType}</Badge>
                <Badge variant="canon">{entry.status}</Badge>
              </div>
              <h2 className="mt-3 text-lg font-semibold tracking-normal">{entry.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  className="font-semibold text-foreground hover:underline"
                  href={`/worlds/${entry.world.id}/lore/${entry.id}`}
                >
                  {entry.world.title}
                </Link>{' '}
                · updated {new Date(entry.updatedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ProfileList>
      </section>

      <ProfileList title="Recent votes">
        {profile.history.votes.map((vote) => (
          <li
            className="rounded-panel border border-border bg-surface p-4"
            key={`${vote.proposal.id}-${vote.createdAt}`}
          >
            <div className="flex flex-wrap gap-2">
              <Badge variant="proposal">{vote.choice}</Badge>
              <Badge variant="neutral">{vote.proposal.status}</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-normal">{vote.proposal.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {vote.proposal.world.title} · voted {new Date(vote.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ProfileList>

      {totalActivity === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              This contributor has no public contribution history yet.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ProfileList({ children, title }: { children: React.ReactNode; title: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) && items.length === 0;

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
      {isEmpty ? (
        <Card>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">Nothing to show yet.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">{items}</ul>
      )}
    </section>
  );
}
