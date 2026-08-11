import { PlaceholderPage } from '@/components/layout/placeholder-page';

type WorldPageProps = {
  params: Promise<{ worldId: string }>;
};

export default async function WorldPage({ params }: WorldPageProps) {
  const { worldId } = await params;

  return <PlaceholderPage eyebrow={`World ${worldId}`} title="World hub foundation" />;
}
