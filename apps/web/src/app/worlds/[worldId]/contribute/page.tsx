import { LoreContributeClient } from '@/components/lore/lore-contribute-client';

type ContributePageProps = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ entryId?: string; type?: string }>;
};

export default async function ContributePage({ params, searchParams }: ContributePageProps) {
  const { worldId } = await params;
  const query = await searchParams;

  return <LoreContributeClient entryId={query.entryId} type={query.type} worldId={worldId} />;
}
