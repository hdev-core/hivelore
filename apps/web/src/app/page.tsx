import { HiveBrand } from "@/components/hive-brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

const statusTokens = [
  "Canon",
  "Draft",
  "Proposal",
  "AI Warning",
  "Rejected",
  "Alternate",
];

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

        <section className="grid flex-1 items-center gap-10 py-16 md:grid-cols-[1fr_18rem]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Design foundation
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Semantic tokens for collaborative worldbuilding.
            </h1>
            <p className="prose-text mt-6 max-w-2xl">
              This Step 2 foundation defines HiveLore theme tokens, typography,
              focus states, status colors, and official Hive brand assets. Full
              application screens and business behavior will come later.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {statusTokens.map((status) => (
                <span className="status-chip" key={status}>
                  {status}
                </span>
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
              Hive brand colors are kept as dedicated tokens, separate from the
              general HiveLore interface palette.
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
