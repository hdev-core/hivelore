# HiveLore

> Collaborative worldbuilding platform built on the Hive blockchain.

## Overview

HiveLore enables communities to collaboratively build fictional worlds instead of isolated stories. Founders create a World Seed and World Bible, contributors expand the world through proposals, AI checks for consistency, and the community decides what becomes canon. Approved content is permanently published on Hive.

## Goals

- Collaborative worldbuilding
- Transparent canon governance
- Permanent authorship
- AI-assisted consistency
- Hive-native identity and rewards
- Scalable indexed blockchain architecture

---

# Core Principles

- Hive is the immutable public record.
- PostgreSQL is the indexed application database.
- Canon is determined by community governance.
- Hive rewards determine financial incentives.
- AI assists but never decides canon.
- Only approved content is published on-chain.
- MVP runs on free-tier infrastructure.

---

# Architecture

```text
Client (Next.js + React)
          │
          ▼
     Fastify API
     │    │    │
     │    │    └── AI Services
     │    │
     │    ├──── PostgreSQL
     │    │
     │    └──── WAX (@hiveio/wax)
     │
     ▼
Hive Blockchain
     ▲
     │
 HAF Indexer
     │
     ▼
PostgreSQL
```

---

# Technology Stack

## Frontend

- Next.js
- React
- Hive Keychain
- HiveSigner
- @hiveio/wax
- TanStack Query
- TipTap

Modern TypeScript stack providing secure Hive authentication, efficient data fetching, and a rich editing experience.

## Backend

- Node.js
- Fastify

Responsible for authentication, governance, AI integration, publishing, indexing, moderation, and REST APIs.

## Database

- PostgreSQL
- Prisma ORM

Stores drafts, proposals, AI reports, relationships, search indexes, moderation data, sessions, analytics, and indexed blockchain metadata.

## Hosting

- Vercel
- Supabase PostgreSQL
- Free backend hosting

Designed to keep the MVP deployable without mandatory paid services.

---

# Hive Integration

## Publishing

### Hive Posts

- World Seeds
- World Bible versions
- Canon lore
- Story chapters

### Hive Comments

- Story continuations
- Community discussions

### custom_json

- Canon approvals
- Lore relationships
- Revision history
- Metadata
- Beneficiary settings

## Signing

Hive transactions are built and signed using WAX through Hive Keychain or HiveSigner.

## Reading

Blockchain data is indexed through HAF and synchronized into PostgreSQL for fast application queries and analytics.

---

# On-chain vs Off-chain

Hive stores immutable published canon and creator attribution.

## Hive (On-chain)

- World Seeds
- Published World Bible
- Canon lore
- Canon decisions
- Story chapters
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

1. Enter Hive username
2. Sign authentication challenge
3. Verify signature
4. Create secure session

Private keys are never stored. Authentication is entirely non-custodial.

---

# Canon Governance

## Canon Workflow

1. Contributor submits proposal
2. AI performs consistency analysis
3. Community reviews and votes
4. Proposal reaches approval threshold
5. Proposal becomes canon
6. Backend publishes approved content to Hive
7. HAF indexes the published record

## App Voting

Default MVP requirements:

- Minimum vote threshold
- 70% approval

## Hive Voting

Hive votes determine:

- Visibility
- Financial rewards
- Public engagement

Financial influence never determines canon.

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
- Hive Publishing
- Search
- Profiles
- Moderation

---

# Reputation & Rewards

Application reputation is independent of Hive reputation and is computed by an indexer using both application events and indexed Hive activity.

## Reputation

The indexer continuously aggregates signals such as:

- Canon lore accepted
- Approved proposals
- World Bible contributions
- Community voting participation
- Constructive discussions
- Founder and moderator activity
- AI-assisted review outcomes
- Moderation actions

Reputation is recalculated from historical events, making it transparent, auditable, and reproducible.

Reputation influences governance, permissions, contributor recognition, and future reputation-weighted voting.

## Rewards

Hive remains the financial reward layer.

Published canon is posted with beneficiary settings defining reward distribution.

| Recipient | Share |
|-----------|------:|
| Contributor | 90% |
| World Founder | 10% |
| Platform | 0% |

Through HAF, the indexer aggregates:

- Author rewards
- Beneficiary rewards
- Curation rewards
- Post payouts
- Contribution history

These indexed records power contributor profiles, leaderboards, analytics, and historical reward tracking without affecting canon governance.

---

# Project Status

**Current Stage:** MVP

### MVP Focus

- Core worldbuilding
- Canon governance
- Hive publishing
- Reputation system
- Search

### Not Included

- Mobile application
- Multi-chain support
- Interactive maps
- AI story generation

---

# Roadmap

```text
Sprint   Goal
-------  -------------------------------
0        Architecture & Infrastructure
1        Hive Authentication
2        World & Lore
3        AI Consistency
4        Canon Workflow
5        Hive Publishing
6        Blockchain Indexer
7        Reputation & Profiles
8        Search & Discovery
9        QA & MVP
```

---

# Future Work

- Interactive maps
- Reputation-weighted governance
- AI world simulation
- Advanced analytics
- Plugin ecosystem
- Public developer API
````
