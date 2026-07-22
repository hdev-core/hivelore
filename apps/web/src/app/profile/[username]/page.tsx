import { PlaceholderPage } from '@/components/layout/placeholder-page';

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;

  return <PlaceholderPage eyebrow={`Profile ${username}`} title="Profile foundation" />;
}
