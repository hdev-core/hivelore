import { PlaceholderPage } from '@/components/layout/placeholder-page';

type ProposalPageProps = {
  params: Promise<{ proposalId: string; worldId: string }>;
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { proposalId, worldId } = await params;

  return (
    <PlaceholderPage
      eyebrow={`World ${worldId} / Proposal ${proposalId}`}
      title="Canon vote foundation"
    />
  );
}
