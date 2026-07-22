# HiveLore — Deployment & Infrastructure Guide

Infra reference for **hivelore** (Next.js + React monorepo). Start here for *"where does my code
run"* and *"why can't I deploy X."*

**Your team & who owns which infra piece**
- **Perla** — PostgreSQL + Prisma on Supabase (§3b) + Next.js monorepo scaffold + Hive integration.
- **Kareem Naous** — frontend / UI foundation (app shell, design system).

---

## 1. Your stack

| Layer | What you use | Where it runs |
|-------|--------------|---------------|
| Frontend + API routes | Next.js + React | **Vercel** (Next.js is native to Vercel) |
| Database | Postgres via **Prisma** | **Supabase** |
| HAF → Postgres **indexer** | your sync worker | **always-on** → local now, Render/Hetzner later |
| Auth | Keychain + custodial Google provisioner | Hive-native, **not** Supabase Auth |

Note the split: **Next.js API routes deploy on Vercel automatically** (serverless), but your
**HAF→Postgres indexer is a persistent process** and **cannot** run on Vercel — see §4.

---

## 2. "I can't deploy / connect X" — how access works

Connecting Supabase / Vercel / Render to a repo in the **`hdev-core`** org needs an **org owner
(Dr. Mohammad)** to authorize that service's GitHub app — you can't self-authorize. To request:
comment on your DevOps card naming the **service** + that it's scoped to **hivelore only**.
**Tip:** the Vercel *Actions* method (§3A) needs no org app — you can do it yourself.

*(Perla — this is exactly the "I don't have permission to deploy on Vercel" blocker: for the
frontend use §3A and you're unblocked without waiting on an org install.)*

---

## 3. Frontend → Vercel  (HiveLore is **Next.js** — use the Git integration)

> ⚠️ **Because HiveLore is Next.js, use Vercel's native Git integration, NOT the CLI action.**
> Vercel builds Next.js natively. The CLI `vercel deploy --prebuilt` step **hangs** on this monorepo
> when the Vercel Root Directory isn't set to `apps/web` (or double-builds if Vercel's Git deploy is
> also on) — that's the 1h+ stuck "Preview Web" run we saw. Fix it once via the dashboard, below.

**A) Recommended — Vercel Git integration (no workflow files).**
1. Import the `hivelore` repo in the Vercel dashboard.
2. **Root Directory → `apps/web`**, Framework → Next.js, Output Directory → empty/default.
3. **Delete `preview.yml` / `deploy.yml`** — Vercel then auto-builds every PR with a preview URL and
   deploys `main`, with no GitHub Action to hang.

**B) If you keep the GitHub Actions method:** set the Vercel project's **Root Directory = `apps/web`**,
**disconnect Vercel's own Git auto-deploy** (Settings → Git) so the action and Vercel don't
double-build, and make sure the workflows have `timeout-minutes` so a stuck deploy fails fast.

## 3b. Database → Supabase + Prisma  *(Perla)*

1. Supabase app already approved for **hivelore** ✅.
2. Two connection strings — the #1 gotcha:
   - `DATABASE_URL` — pooled, port **6543**, add **`?pgbouncer=true`** (runtime).
   - `DIRECT_URL` — direct, port **5432** (Prisma **migrations**).
   Both in `.env` (**never commit**); `schema.prisma`: `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`.
3. Supabase = DB/storage only. Auth stays Hive-native; canonical records go **on-chain**.

---

## 4. Your always-on service (the HAF→Postgres indexer)

The indexer is a persistent process — Vercel/Supabase can't host it.
- **While building:** run it **locally**. It does **not** block your other progress, and your
  Next.js frontend/API deploy fine to Vercel without it.
- **For a live demo:** **Render** (indexer as a **background worker** — free tier spins down) or,
  preferred for 24/7, **our Hetzner box**. Request when you're ready for end-to-end staging.

---

## 5. Branch / PR / deploy flow

`feature/* → PR → develop → PR → main → auto-deploys`. Never push straight to `main`/`develop`.
Open a PR; **Dr. Mohammad reviews & merges**. Comment on your card + link the PR when you move it.

## 6. Secrets hygiene
Never commit `.env`, tokens, or DB strings. `.gitignore` `.env` + `.vercel`. CI secrets → GitHub repo secrets.
