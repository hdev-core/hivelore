import { LoreEntryDetailClient } from '@/components/lore/lore-entry-detail-client';
import { ApiError } from '@/lib/api/errors';
import { getLoreEntry } from '@/lib/api/lore';

type LoreEntryPageProps = {
  params: Promise<{ entryId: string; worldId: string }>;
};

export default async function LoreEntryPage({ params }: LoreEntryPageProps) {
  const { entryId, worldId } = await params;

  try {
    const response = await getLoreEntry(worldId, entryId);

    return (
      <LoreEntryDetailClient entryId={entryId} initialEntry={response.entry} worldId={worldId} />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <LoreEntryDetailClient entryId={entryId} worldId={worldId} />;
    }

    throw error;
  }
}
