import { ContributionEditorForm } from '@/components/contributions/contribution-editor-form';
import type { ContributionKind } from '@/lib/api/contributions';

type ContributePageProps = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ entryId?: string; type?: string }>;
};

function getInitialKind(type?: string): ContributionKind {
  return type?.toLowerCase() === 'story' ? 'STORY' : 'LORE';
}

export default async function ContributePage({ params, searchParams }: ContributePageProps) {
  const { worldId } = await params;
  const query = await searchParams;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          World {worldId}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
          Contribution editor
        </h1>
        <p className="prose-text mt-5 max-w-2xl">
          Author a structured draft, save it against this world, then submit it into the proposal
          queue for canon voting.
        </p>
      </section>

      <ContributionEditorForm
        initialKind={getInitialKind(query.type)}
        {...(query.entryId ? { targetLoreEntryId: query.entryId } : {})}
        worldId={worldId}
      />
    </div>
  );
}
