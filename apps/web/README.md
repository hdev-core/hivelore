# HiveLore Web Foundation

This workspace is the responsive Next.js frontend foundation for HiveLore. It proves layout, routing, theming, reusable UI primitives, shared page states, TanStack Query wiring, the API client, official Hive assets, and the TipTap editor scaffold. It does not implement production product workflows yet.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Environment files copied from the checked-in examples

Install dependencies from the repository root:

```bash
npm install
```

## Run And Verify

Run the frontend only:

```bash
npm run dev --workspace=@hivelore/web
```

Run all local services:

```bash
npm run dev
```

Quality commands:

```bash
npm run lint --workspace=@hivelore/web
npm run typecheck --workspace=@hivelore/web
npm run build --workspace=@hivelore/web
```

There is currently no configured `test` script.

## Environment Variables

`apps/web/.env.example` documents frontend-safe variables.

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is public browser configuration for the API client. Do not put secrets in frontend environment variables.

## Structure

```text
apps/web/
|-- public/
|   `-- brands/hive/
|-- src/
|   |-- app/
|   |-- components/
|   |   |-- editor/
|   |   |-- layout/
|   |   |-- states/
|   |   `-- ui/
|   |-- lib/
|   |   |-- api/
|   |   `-- query/
|   `-- providers/
`-- README.md
```

## Tokens And Themes

Semantic design tokens live in `src/app/globals.css`. Hive brand colors are kept as dedicated `--hive-*` tokens and are separate from the general HiveLore interface palette.

Light, dark, and system theme preferences are managed by `src/providers/theme-provider.tsx`. The root layout runs a small inline initialization script before hydration so the correct `data-theme` and `color-scheme` are applied early and persisted in `localStorage` under `hivelore-theme`.

## Reusable Components

- `src/components/layout` contains the shared app shell, header, responsive navigation, main container, and placeholder page presentation.
- `src/components/ui` contains Button, Badge, Card, Alert, Input, SearchInput, Select, Textarea, Spinner, Skeleton, and Tabs primitives.
- `src/components/states` contains `LoadingState`, `EmptyState`, and `ErrorState`.
- `src/components/editor` contains the client-only TipTap `RichTextEditor` scaffold and toolbar.

Button variants: `primary`, `secondary`, `outline`, `ghost`, `danger`, and `hive`.

Badge variants cover neutral and workflow/status presentations, including draft, proposal, warning, review, canon, rejected, alternate timeline, archived, ready, and published states. These are presentation variants only.

Use `LoadingState` for page or contained waiting surfaces, `EmptyState` for no-content previews or future empty feature areas, and `ErrorState` for safe user-facing failures. Do not pass raw internal errors to users.

## Data Access Foundation

TanStack Query is configured in `src/providers/query-provider.tsx` using `src/lib/query/query-client.ts`. The provider is included once by `src/providers/app-providers.tsx`.

The API client lives in `src/lib/api/client.ts`, with safe API error helpers in `src/lib/api/errors.ts`. It reads `NEXT_PUBLIC_API_URL` from `src/lib/env.ts`. No fake API endpoints were added for the UI foundation.

## TipTap Editor

`RichTextEditor` is a narrow client component using:

- `@tiptap/react`
- `@tiptap/starter-kit`
- `@tiptap/extension-placeholder`

The component is semi-controlled: `initialContent` seeds the editor once, and `onChange` emits HTML updates for parent-owned draft state. It supports placeholder text, disabled state, read-only state, active toolbar state, and disabled undo/redo controls. It does not save drafts, submit proposals, run AI checks, perform relationship search, or provide collaborative editing.

## Hive Assets And Branding

Official Hive assets live in `public/brands/hive/` and are rendered through `src/components/hive-brand.tsx`.

Hive-specific styling is reserved for official brand marks and explicit Hive actions. General HiveLore UI should use semantic tokens such as `background`, `surface`, `foreground`, `primary`, `muted`, `border`, `success`, `warning`, and `danger`; do not make the entire shell Hive red.

## Routes

Current foundation routes:

- `/`
- `/login`
- `/worlds`
- `/worlds/new`
- `/worlds/[worldId]`
- `/worlds/[worldId]/lore/[entryId]`
- `/worlds/[worldId]/contribute`
- `/worlds/[worldId]/proposals/[proposalId]`
- `/profile/[username]`
- `/foundation`

Root route-level states include `loading.tsx`, `error.tsx`, and `not-found.tsx`.

## Intentionally Out Of Scope

This foundation does not yet implement Hive authentication or signing, Hive Keychain or HiveSigner integration, backend endpoints, Prisma/database infrastructure, world or lore CRUD, voting calculations, canonization workflow, AI consistency checking, relationship search, proposal submission, reward calculations, advanced maps, real-time collaboration, or complete feature screens.
