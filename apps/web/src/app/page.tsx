import { HiveBrand } from '@/components/hive-brand';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <HiveBrand className="h-9 w-11" />
            <span className="text-lg font-semibold tracking-normal">HiveLore</span>
          </div>
          <ThemeSwitcher />
        </header>

        <section className="grid items-center gap-10 py-16 md:grid-cols-[1fr_18rem]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Design foundation
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Semantic tokens for collaborative worldbuilding.
            </h1>
            <p className="prose-text mt-6 max-w-2xl">
              This Step 2 foundation defines HiveLore theme tokens, typography, focus states, status
              colors, and official Hive brand assets. Full application screens and business behavior
              will come later.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {badgeVariants.slice(0, 6).map(([label, variant]) => (
                <Badge key={variant} variant={variant}>
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          <aside className="rounded-panel border border-border bg-surface p-5 shadow-elevated">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Official Hive asset
            </p>
            <div className="mt-5 flex justify-center rounded-control border border-border bg-[var(--hive-white)] p-5">
              <HiveBrand variant="lockup" className="w-48" />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Hive brand colors are kept as dedicated tokens, separate from the general HiveLore
              interface palette.
            </p>
          </aside>
        </section>

        <section
          aria-labelledby="component-primitives-heading"
          className="border-t border-border py-10"
        >
          <div className="mb-6">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Development check
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-normal"
              id="component-primitives-heading"
            >
              Core UI primitives
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
                <CardDescription>
                  Keyboard focus, disabled states, loading states, and invalid inputs can be checked
                  here.
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
          </div>

          <Tabs className="mt-6" defaultValue="one">
            <TabsList aria-label="Component verification tabs">
              <TabsTrigger value="one">First tab</TabsTrigger>
              <TabsTrigger value="two">Second tab</TabsTrigger>
              <TabsTrigger disabled value="disabled">
                Disabled tab
              </TabsTrigger>
            </TabsList>
            <TabsContent value="one">
              <Card variant="muted">
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Use Tab to focus the selected trigger, then arrow keys to move between enabled
                    tabs.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="two">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}
