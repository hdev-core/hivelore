import { PlaceholderPage } from '@/components/layout/placeholder-page';

type LoreEntryPageProps = {
  params: Promise<{ entryId: string; worldId: string }>;
};

export default async function LoreEntryPage({ params }: LoreEntryPageProps) {
  const { entryId, worldId } = await params;

  return (
    <PlaceholderPage
      eyebrow={`World ${worldId} / Lore ${entryId}`}
      title="Lore entity foundation"
    />
  );
}
