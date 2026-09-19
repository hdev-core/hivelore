import { CanonVoteScreen } from './canon-vote-screen';

type ProposalPageProps = {
  params: Promise<{ proposalId: string; worldId: string }>;
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { proposalId, worldId } = await params;

  return <CanonVoteScreen proposalId={proposalId} worldId={worldId} />;
}
