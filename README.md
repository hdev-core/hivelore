# HiveLore

> Collaborative worldbuilding platform built on the Hive blockchain.

## Overview

HiveLore enables communities to collaboratively build fictional worlds instead of isolated stories. Founders create a **World Seed** and **World Bible**, contributors submit **Proposals** to expand or refine the world, AI evaluates submissions for consistency, and the community determines which proposals are approved for publication. Contributors publish approved content to the Hive blockchain, where it becomes official **Canon**.

---

# Glossary

| Term | Definition |
|------|------------|
| **World Seed** | The foundational concept of a fictional world, defining its premise, genre, and creative direction. |
| **World Bible** | The authoritative reference describing the world's rules, history, characters, locations, factions, and other canonical knowledge. |
| **Proposal** | A contributor-submitted request to add, modify, or expand the World Bible or existing lore. |
| **Approved Proposal** | A proposal that has passed community governance and is authorized for publication, but is not yet canonical. |
| **Canon** | Content that has been approved, published to the Hive blockchain, and indexed by HiveLore. |
| **Canon Lore** | An approved unit of worldbuilding, such as a character, location, faction, event, artifact, or historical record. |
| **Story Chapter** | A narrative set within an established world that builds upon existing canon without redefining it. |

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
          │
          ▼
     Fastify API
     │    │    │
     │    │    └── AI Consistency Service
     │    │
     │    ├──── PostgreSQL
     │    │
     │    └──── WAX + Hive Keychain / HiveSigner
     │
     ▼
Hive Blockchain
     ▲
     │
 HAF / Hive Indexer
     │
     ▼
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

| Recipient | Share |
|-----------|------:|
| Contributor | 90% |
| World Founder | 10% |
| Platform | 0% |

Indexed Hive reward data powers contributor profiles, leaderboards, analytics, and historical reward tracking without influencing canon governance.

---

# Project Status

**Current Stage:** MVP

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
