# HiveLore

> Collaborative worldbuilding platform built on the Hive blockchain.

## Overview

HiveLore enables communities to collaboratively build fictional worlds instead of isolated stories. Founders create a **World Seed** and **World Bible**, contributors submit **Proposals** to expand or refine the world, AI evaluates submissions for consistency, and the community determines which proposals are approved for publication. Contributors publish approved content to the Hive blockchain, where it becomes official **Canon**.

---

# Glossary

| Term                  | Definition                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **World Seed**        | The foundational concept of a fictional world, defining its premise, genre, and creative direction.                                |
| **World Bible**       | The authoritative reference describing the world's rules, history, characters, locations, factions, and other canonical knowledge. |
| **Proposal**          | A contributor-submitted request to add, modify, or expand the World Bible or existing lore.                                        |
| **Approved Proposal** | A proposal that has passed community governance and is authorized for publication, but is not yet canonical.                       |
| **Canon**             | Content that has been approved, published to the Hive blockchain, and indexed by HiveLore.                                         |
| **Canon Lore**        | An approved unit of worldbuilding, such as a character, location, faction, event, artifact, or historical record.                  |
| **Story Chapter**     | A narrative set within an established world that builds upon existing canon without redefining it.                                 |

---

# Core Principles

- Hive is the immutable public record.
- PostgreSQL is the indexed application database.
- Canon is determined through community governance and finalized by on-chain publication.
- Hive rewards determine financial incentives.
- AI assists but never determines canon.
- Only approved content is published on-chain.
- Contributors remain the on-chain authors of their work.
- The MVP targets free-tier infrastructure.

---

# Goals

- Collaborative worldbuilding
- Transparent canon governance
- Permanent authorship
- AI-assisted consistency
- Hive-native identity and rewards
- Scalable indexed blockchain architecture

---

# Architecture

```text
Client (Next.js + React)
          |
          v
     Fastify API
     |    |    |
     |    |    `-- AI Consistency Service
     |    |
     |    |---- PostgreSQL
     |    |
     |    `---- WAX + Hive Keychain / HiveSigner
     |
     v
Hive Blockchain
     ^
     |
 HAF / Hive Indexer
     |
     v
PostgreSQL
```

---

# Technology Stack

## Frontend

- Next.js
- React
- TanStack Query
- TipTap
- Hive Keychain
- HiveSigner
- @hiveio/wax

Modern TypeScript stack providing secure Hive authentication, efficient data fetching, and a rich editing experience.

## Backend

- Node.js
- Fastify
- Prisma ORM

Responsible for authentication, governance, AI integration, indexing, moderation, and REST APIs.

## Database

- PostgreSQL

Stores drafts, proposals, AI reports, relationships, search indexes, moderation data, sessions, analytics, and indexed blockchain metadata.

## Infrastructure

- Vercel (Frontend)
- Supabase PostgreSQL
- Free Node.js hosting (Backend)

The MVP targets free-tier deployment. HAF indexing may use a public provider during development, with self-hosting considered for future production deployments.

---

# Hive Integration

## Publishing

HiveLore follows a non-custodial publishing model. Once a proposal is approved for publication, the contributor signs the final Hive transaction using Hive Keychain or HiveSigner. After the transaction is confirmed and indexed, the content becomes official canon.

### Hive Posts

- World Seeds
- World Bible versions
- Canon lore
- Story chapters

### Hive Comments

- Community discussions
- Story continuations

### custom_json

- Canon approvals
- Lore relationships
- Revision history
- Metadata
- Beneficiary settings

## Resource Credits

Publishing requires Hive Resource Credits (RC). Contributors are responsible for maintaining sufficient RC to publish content. Future versions may support optional account onboarding and RC delegation. The MVP assumes contributors already own a Hive account. Account creation
and optional RC delegation are future enhancements.

## Reading

Published blockchain data is indexed through HAF or compatible Hive indexing services and synchronized into PostgreSQL for fast queries, search, analytics, and contributor profiles.

---

# On-chain vs Off-chain

Hive stores immutable published canon and creator attribution.

## Hive (On-chain)

- World Seeds
- Published World Bible
- Canon lore
- Story chapters
- Canon decisions
- Creator attribution
- Rewards
- Beneficiary metadata

## PostgreSQL (Off-chain)

Stores mutable application state optimized for querying.

- Drafts
- Proposals
- AI reports
- Lore graph
- Search index
- Moderation
- Sessions
- Analytics

---

# Identity & Authentication

Hive accounts are the platform's only identity system.

Authentication flow:

1. Enter Hive username.
2. Sign an authentication challenge.
3. Verify the signature.
4. Create a secure session.

Private keys are never stored. Authentication is entirely non-custodial.

---

# Governance

## Publication Workflow

1. Contributor submits a proposal.
2. AI analyzes the proposal against the current World Bible and related canon.
3. Community reviews the proposal and AI report.
4. Eligible contributors vote.
5. Proposal reaches the approval threshold.
6. Proposal becomes **Approved for Publication**.
7. Contributor signs the final Hive transaction.
8. Content is published to the Hive blockchain.
9. The indexer synchronizes the published record into PostgreSQL.
10. The published content becomes **Canon**.

## AI Consistency

AI provides advisory analysis only by comparing proposals against the current World Bible and related canon.

Checks include:

- Rule conflicts
- Timeline inconsistencies
- Duplicate lore
- Character continuity
- Location continuity
- Missing references

AI recommendations never approve or reject proposals. AI analysis uses a configurable LLM provider, allowing deployments to use
available free-tier quotas or self-hosted models.

## App Voting

Default MVP:

- Minimum vote threshold
- 70% approval
- Voting restricted to contributors meeting minimum reputation requirements

These rules provide basic protection against Sybil attacks while keeping governance simple.

## Hive Voting

Hive votes determine:

- Visibility
- Financial rewards
- Community engagement

Hive voting never determines canon.

---

# Data Model

## World

- World
- WorldBibleVersion

## Lore

- LoreEntry
- LoreRelationship
- Proposal

## Governance

- AppVote
- AIReport
- ModerationReport

## Hive

- HiveReference
- HiveEvent

## Profiles

- User
- RewardRecord
- UserRewardSummary
- UserReputationSnapshot

## Infrastructure

- SearchIndex

---

# API Overview

REST API modules:

- Authentication
- Worlds
- Lore
- Proposal Workflow
- Voting
- AI Analysis
- Hive Integration
- Search
- Profiles
- Moderation

---

# Reputation & Rewards

Application reputation is independent of Hive reputation and is computed from application events and indexed Hive activity.

## Reputation

The reputation indexer aggregates:

- Accepted canon contributions
- Approved proposals
- Community participation
- Voting activity
- Founder activity
- Moderator actions
- Moderation history

Reputation is recalculated from historical events, making it transparent, auditable, and reproducible.

Reputation influences governance eligibility, contributor recognition, and future reputation-weighted features.

## Rewards

Hive remains the financial reward layer.

Approved canon is published by its contributor with beneficiary settings defining reward distribution.

| Recipient     | Share |
| ------------- | ----: |
| Contributor   |   90% |
| World Founder |   10% |
| Platform      |    0% |

Indexed Hive reward data powers contributor profiles, leaderboards, analytics, and historical reward tracking without influencing canon governance.

---

# Project Status

**Current Stage:** MVP infrastructure scaffold

The repository currently contains foundation infrastructure only. Product features described in the vision and roadmap are planned for later work and are not implemented in this scaffold.

The web workspace now includes a UI foundation: shared responsive application shell, reusable UI primitives, loading/empty/error states, minimal placeholder routes, route-level loading/error/not-found states, theme switching, official Hive asset usage, TanStack Query/API client wiring, and a TipTap editor scaffold. See `apps/web/README.md` for frontend-specific usage and boundaries.

## MVP Focus

- Core worldbuilding
- Canon governance
- Hive publishing
- Reputation system
- Search

## Not Included

- Mobile application
- Multi-chain support
- Interactive maps
- AI story generation
- Automated account onboarding
- RC delegation

---

# Roadmap

```text
Sprint   Goal
-------  -------------------------------
0        Architecture & Infrastructure
1        Hive Authentication
2        World & Lore
3        AI Consistency
4        Governance Workflow
5        Hive Publishing
6        Blockchain Indexing
7        Reputation & Profiles
8        Search & Discovery
9        QA & MVP Release
```

---

# Future Work

- Interactive maps
- Reputation-weighted governance
- AI world simulation
- Advanced analytics
- Plugin ecosystem
- Public developer API
- Account onboarding and RC delegation
- Self-hosted HAF infrastructure

---

# Development

## Requirements

- Node.js 22 LTS or newer
- npm 10 or newer
- Git

## Installation

```bash
git clone <repository-url>
cd hivelore
npm install
```

## Environment Setup

Create local environment files from the checked-in examples. Never commit real secrets, and never use `NEXT_PUBLIC_` for secret values.

Windows Command Prompt:

```bat
copy .env.example .env
copy apps\web\.env.example apps\web\.env.local
copy apps\api\.env.example apps\api\.env
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env
```

macOS/Linux:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

## Database Infrastructure

### Architecture

Supabase provides the hosted PostgreSQL database for the MVP. Prisma lives in the API workspace and is the backend ORM and migration system.

Hive remains the immutable source of truth for published canon, on-chain authorship, rewards, beneficiary metadata, and blockchain events. PostgreSQL stores mutable application state plus indexed and derived projections used for fast API queries.

Application source data includes worlds, World Bible draft/version state, lore draft/application state, lore relationships, proposals, app votes, advisory AI reports, moderation reports, user profile metadata, application reputation snapshots, and PostgreSQL search rows. Indexed or derived projections include Hive references, Hive events, reward records, reward summaries, verified on-chain publication metadata, on-chain authorship, beneficiary metadata, and reward data. Projection tables must be rebuildable from Hive or source application records.

### Required Environment Variables

Add these server-only variables to `apps/api/.env`. Never commit real values, never prefix them with `NEXT_PUBLIC_`, and never put database passwords in frontend environment files.

```env
# PostgreSQL application connection through the Supabase pooler.
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true"

# Direct PostgreSQL connection used for Prisma migrations and administrative operations.
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/postgres"

# Hive integration defaults to public development endpoints.
HIVE_RPC_URL="https://api.hive.blog"
HAF_API_URL="https://api.hive.blog/hafbe-api"
HIVELORE_APP_ID="hivelore/0.1.0"
```

`DATABASE_URL` is the pooled connection used by normal API queries. `DIRECT_URL` is the direct PostgreSQL connection Prisma uses for migrations and administrative operations. Supabase service-role keys are not required for Prisma's PostgreSQL connection. Hive private keys must never be stored.

Use separate credentials and databases for development and production. Do not reset a shared development database without team coordination.

### Supabase Setup

1. Create or select a Supabase project.
2. Open the project's database connection settings.
3. Copy the pooled application connection string for normal API queries.
4. Copy the direct PostgreSQL connection string for Prisma migrations.
5. Put both values in `apps/api/.env`.
6. Keep `apps/api/.env` ignored and store deployed API credentials only in the API hosting provider's secret settings.

Supabase dashboard labels can vary, but the important distinction is pooled application access versus direct migration access.

### Prisma Commands

Run database commands from the repository root:

```bash
npm run db:generate
npm run db:validate
npm run db:format
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
npm run db:studio
npm run db:reset
```

- `db:generate` generates the API-local Prisma Client.
- `db:validate` validates `apps/api/prisma/schema.prisma`.
- `db:format` formats the Prisma schema.
- `db:migrate` creates and applies a development migration using `DIRECT_URL`.
- `db:migrate:deploy` applies committed migrations in hosted environments.
- `db:seed` runs the deterministic fictional development seed.
- `db:studio` opens Prisma Studio.
- `db:reset` is destructive. It drops and recreates the configured database schema, reapplies migrations, and runs the seed only after Prisma's confirmation prompt.

### First Setup

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Before running migration or seed commands, create `apps/api/.env` with safe development Supabase credentials. Do not use production credentials for local destructive testing.

### Migration Workflow

Edit `apps/api/prisma/schema.prisma`, then run:

```bash
npm run db:format
npm run db:validate
npm run db:migrate
```

Review generated SQL under `apps/api/prisma/migrations`, commit the schema and migration together, and use `npm run db:migrate:deploy` in hosted API environments. Do not manually create production tables in the Supabase dashboard as a substitute for migrations.

Feature branches must include migration files. Resolve migration conflicts before merge.

### Seed Behavior

The seed at `apps/api/prisma/seed.ts` is development-only and contains fictional Hive usernames, world content, lore, one lore relationship, one submitted proposal, and an advisory AI report. It does not seed real people, credentials, Hive private keys, real blockchain transactions, or financial payout projections.

### On-chain Boundary

Hive is authoritative for on-chain publication, authorship, rewards, beneficiary metadata, and blockchain events. `HiveReference`, `HiveEvent`, `RewardRecord`, and `UserRewardSummary` are indexed or derived database projections. A local PostgreSQL flag or timestamp is never sufficient to prove canon; canon requires an approved publication that has been published to Hive and indexed by HiveLore.

All backend Hive access goes through `apps/api/src/lib/hive`. The module uses `@hiveio/wax` for transaction build, serialization, signing handoff, and broadcast; it exposes signer abstractions for Hive Keychain and HiveSigner flows without storing private keys. HAF reads use the configurable read-only `HAF_API_URL` client and are normalized before projection into PostgreSQL. The initial default is Hive's public HAF Block Explorer endpoint; self-hosted HAF remains deferred.

## Run Locally

```bash
npm run dev
```

Local services:

- Web: http://localhost:3000
- API: http://localhost:3001
- Health: http://localhost:3001/health

Run one application at a time:

```bash
npm run dev:web
npm run dev:api
```

## Quality Commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
```

Additional root commands:

```bash
npm run format
npm run lint:fix
npm run clean
```

Workspace examples:

```bash
npm run build --workspace=@hivelore/web
npm run start --workspace=@hivelore/api
```

## Repository Map

```text
hivelore/
|-- apps/
|   |-- api/
|   |   |-- src/
|   |   |   |-- config/
|   |   |   |   `-- env.ts
|   |   |   |-- routes/
|   |   |   |   `-- health.ts
|   |   |   |-- app.ts
|   |   |   `-- server.ts
|   |   |-- .env.example
|   |   |-- package.json
|   |   `-- tsconfig.json
|   `-- web/
|       |-- public/
|       |-- src/
|       |   |-- app/
|       |   |   |-- globals.css
|       |   |   |-- layout.tsx
|       |   |   `-- page.tsx
|       |   |-- components/
|       |   |   |-- editor/
|       |   |   |-- layout/
|       |   |   |-- states/
|       |   |   `-- ui/
|       |   `-- lib/
|       |       |-- api/
|       |       |-- query/
|       |       `-- env.ts
|       |-- .env.example
|       |-- README.md
|       |-- next-env.d.ts
|       |-- next.config.ts
|       |-- package.json
|       `-- tsconfig.json
|-- packages/
|   `-- config/
|       `-- package.json
|-- .github/
|   `-- workflows/
|       `-- ci.yml
|-- .husky/
|   `-- pre-commit
|-- .vscode/
|   |-- extensions.json
|   `-- settings.json
|-- .editorconfig
|-- .env.example
|-- .gitignore
|-- .prettierignore
|-- eslint.config.mjs
|-- package.json
|-- package-lock.json
|-- prettier.config.mjs
|-- tsconfig.base.json
`-- README.md
```

Directory roles:

- `apps/web` is the only frontend application. It is a Next.js App Router scaffold.
- `apps/api` is the only backend application. It is a Fastify TypeScript scaffold with `GET /health`.
- `apps/api/prisma` contains the canonical API Prisma schema, migrations, and development seed.
- `packages` is reserved for shared workspace packages. `packages/config` is intentionally minimal until real shared configuration is needed.
- `.github/workflows` contains CI checks for formatting, linting, type-checking, and builds.
- `.husky` contains the pre-commit hook, which runs `lint-staged` only on staged files.
- `.vscode` contains editor recommendations and shared formatting/linting settings.

## Source Of Truth

- `apps/web` is the only frontend application.
- `apps/api` is the only backend application.
- The root `package.json` coordinates npm workspaces.
- The root `package-lock.json` is the only npm lockfile.
- Root configuration files are shared unless a framework-specific file is necessary.
- `eslint.config.mjs`, `prettier.config.mjs`, and `tsconfig.base.json` are the shared configuration entry points.

## Environment And Secret Rules

- `.env.example`, `apps/web/.env.example`, and `apps/api/.env.example` document safe placeholder values.
- Production web variables belong in Vercel.
- Production API variables belong in the API host.
- CI secrets belong in GitHub Actions secrets.
- Hive private keys must never be collected, stored, transmitted, or logged.
- `NEXT_PUBLIC_` variables are public browser-exposed values and must never contain secrets.
- The frontend reads `NEXT_PUBLIC_API_URL`; it is a placeholder until the Fastify API has a production deployment.

## Vercel Setup

Create a Vercel project for the web app with these monorepo settings:

- Root Directory: `apps/web`
- Framework Preset: `Next.js`
- Install Command: `cd ../.. && npm ci`
- Build Command: `cd ../.. && npm run build --workspace=@hivelore/web`
- Output Directory: leave as the Next.js default

Required Vercel environment variable:

```env
NEXT_PUBLIC_API_URL=<deployed-api-url-placeholder>
```

There is no production API deployment in this scaffold. Replace the placeholder with the deployed Fastify API URL when that later infrastructure exists.

## Team Ownership

Infrastructure owner: Perla

Web package: Kareem, collaborating with Perla
