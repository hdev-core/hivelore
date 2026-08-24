import { LoreContributeClient } from '@/components/lore/lore-contribute-client';

type LoreEditPageProps = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ entryId?: string; type?: string }>;
};

export default async function LoreEditPage({ params, searchParams }: LoreEditPageProps) {
  const { worldId } = await params;
  const query = await searchParams;

  return <LoreContributeClient entryId={query.entryId} type={query.type} worldId={worldId} />;
}
