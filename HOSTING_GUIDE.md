# HiveLore Hosting Guide

HiveLore deploys as three pieces:

| Layer                   | Runtime                                    |
| ----------------------- | ------------------------------------------ |
| Web frontend            | Vercel                                     |
| Postgres database       | Supabase                                   |
| HAF to Postgres indexer | Local while building, always-on host later |

## Vercel via GitHub Actions

This repo uses GitHub Actions instead of the Vercel GitHub app, so an org-wide Vercel app install is not required.

Required GitHub repository secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Required Vercel project environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE_URL
```

Production deploys run from `main` through `.github/workflows/deploy.yml`.
Pull requests get preview deploys through `.github/workflows/preview.yml`.

The Vercel project should use the repository root. The root `vercel.json` builds only the web workspace:

```text
npm run build --workspace=@hivelore/web
```

## Supabase and Prisma

Store database URLs in local `.env` files and hosting dashboards only. Never commit them.

For this repo's Prisma 7 setup, database URLs live in `apps/api/prisma.config.ts` and the API Prisma adapter, not in `schema.prisma`.

Use:

```text
DATABASE_URL = pooled runtime URL, port 6543, pgbouncer=true
DIRECT_URL = migration URL, port 5432
```

## Persistent Indexer

The HAF to Postgres indexer is not a Vercel function. Run it locally while building, then move it to an always-on host such as Render background worker or the team server when staging needs it.

## Branch Flow

Use:

```text
feature/* -> PR -> develop -> PR -> main -> production deploy
```

Avoid pushing directly to `main` or `develop` unless the team explicitly approves it.
