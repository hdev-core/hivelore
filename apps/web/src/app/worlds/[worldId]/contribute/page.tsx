import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import { Card, CardContent } from '@/components/ui/card';

type ContributePageProps = {
  params: Promise<{ worldId: string }>;
};

export default async function ContributePage({ params }: ContributePageProps) {
  const { worldId } = await params;

  return (
    <PlaceholderPage eyebrow={`World ${worldId}`} title="Contribution editor foundation">
      <Card>
        <CardContent>
          <RichTextEditor
            label="Contribution body preview"
            placeholder="Draft contribution text for layout testing..."
          />
        </CardContent>
      </Card>
    </PlaceholderPage>
  );
}
