import { ContributionEditorForm } from '@/components/contributions/contribution-editor-form';
import type { ContributionKind } from '@/lib/api/contributions';
import { loreCategories } from '@/lib/worlds/constants';

type ContributePageProps = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ targetLoreEntryId?: string; type?: string }>;
};

function getInitialKind(type?: string): ContributionKind {
  return type?.toLowerCase() === 'stories' || type?.toLowerCase() === 'story' ? 'STORY' : 'LORE';
}

function getUnsupportedTypeLabel(type?: string) {
  const normalizedType = type?.toLowerCase();

  if (!normalizedType || ['lore', 'stories', 'story'].includes(normalizedType)) {
    return undefined;
  }

  return (
    loreCategories.find((category) => category.id === normalizedType)?.label ?? 'that category'
  );
}

export default async function ContributePage({ params, searchParams }: ContributePageProps) {
  const { worldId } = await params;
  const query = await searchParams;
  const unsupportedTypeLabel = getUnsupportedTypeLabel(query.type);

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
        {...(query.targetLoreEntryId ? { targetLoreEntryId: query.targetLoreEntryId } : {})}
        {...(unsupportedTypeLabel ? { unsupportedType: unsupportedTypeLabel } : {})}
        worldId={worldId}
      />
    </div>
  );
}
