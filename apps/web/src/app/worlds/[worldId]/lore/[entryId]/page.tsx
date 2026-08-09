import { LoreEntryDetailClient } from '@/components/lore/lore-entry-detail-client';

type LoreEntryPageProps = {
  params: Promise<{ entryId: string; worldId: string }>;
};

export default async function LoreEntryPage({ params }: LoreEntryPageProps) {
  const { entryId, worldId } = await params;

  return <LoreEntryDetailClient entryId={entryId} worldId={worldId} />;
}
