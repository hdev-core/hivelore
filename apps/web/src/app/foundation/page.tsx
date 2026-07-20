import { HiveBrand } from '@/components/hive-brand';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const badgeVariants = [
  ['Draft', 'draft'],
  ['Proposal', 'proposal'],
  ['AI Warning', 'ai-warning'],
  ['Under Review', 'under-review'],
  ['Canon', 'canon'],
  ['Canon Approved', 'canon-approved'],
  ['Rejected', 'rejected'],
  ['Alternate Timeline', 'alternate-timeline'],
  ['Archived', 'archived'],
  ['Ready to Publish', 'ready-to-publish'],
  ['Published on Hive', 'published-on-hive'],
] as const;

const buttonVariants = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'hive'] as const;
const selectOptions = ['Character Lore', 'Faction', 'Historical Event', 'Story Contribution'];

export default function FoundationPage() {
  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            UI foundation preview
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            Reusable HiveLore interface pieces.
          </h1>
          <p className="prose-text mt-5 max-w-2xl">
            This development preview demonstrates shared presentation components only. It does not
            contain production worlds, proposal workflows, votes, profiles, or saved lore.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Hive asset check</CardTitle>
            <CardDescription>Official mark usage in both themes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-control border border-border bg-[var(--hive-white)] p-4">
              <HiveBrand variant="lockup" />
            </div>
            <ThemeSwitcher />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="states-heading" className="space-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Shared states
          </p>
          <h2 id="states-heading" className="mt-2 text-2xl font-semibold tracking-normal">
            Loading, empty, and error
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <LoadingState message="Loading foundation preview" />
          <EmptyState
            action={<Button variant="outline">Preview action</Button>}
            message="Use this when a feature area has no user-created content yet."
            title="No preview content"
          />
          <ErrorState action={<Button variant="danger">Retry preview</Button>} />
        </div>
        <LoadingState mode="page" presentation="skeleton" />
      </section>

      <section aria-labelledby="editor-heading" className="space-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Editor scaffold
          </p>
          <h2 id="editor-heading" className="mt-2 text-2xl font-semibold tracking-normal">
            TipTap contribution editor preview
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Development-only editor scaffold with no saving, draft persistence, proposal submission,
            AI checks, or collaboration behavior.
          </p>
        </div>
        <Card>
          <CardContent>
            <RichTextEditor
              initialContent="<p>Use this scaffold to test formatting behavior only.</p>"
              label="Preview contribution body"
              placeholder="Outline a lore contribution..."
            />
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <RichTextEditor disabled label="Disabled editor preview" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <RichTextEditor
                initialContent="<p>This read-only preview cannot be edited.</p>"
                label="Read-only editor preview"
                readOnly
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="controls-heading" className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle id="controls-heading">Buttons and inputs</CardTitle>
            <CardDescription>
              Keyboard focus, disabled states, loading states, and invalid inputs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {buttonVariants.map((variant) => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
              <Button isLoading loadingLabel="Checking">
                Loading
              </Button>
              <Button disabled variant="secondary">
                Disabled
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Title
                <Input placeholder="Enter lore title" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Entry type
                <Select defaultValue="Character Lore">
                  {selectOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Search
                <SearchInput aria-label="Search lore archive" />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Invalid field
                <Input
                  aria-describedby="invalid-example-message"
                  defaultValue="Conflicting canon value"
                  isInvalid
                />
                <span className="text-sm font-normal text-danger" id="invalid-example-message">
                  This example shows the invalid presentation state.
                </span>
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Notes
                <Textarea placeholder="Draft a neutral verification note." />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Status badges</CardTitle>
              <CardDescription>Presentation variants only.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {badgeVariants.map(([label, variant]) => (
                <Badge key={variant} variant={variant}>
                  {label}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Alert variant="warning">
            <AlertTitle>AI warning example</AlertTitle>
            <AlertDescription>
              This is a reusable alert style, not workflow behavior.
            </AlertDescription>
          </Alert>
        </div>
      </section>
    </div>
  );
}
