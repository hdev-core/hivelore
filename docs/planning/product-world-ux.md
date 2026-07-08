# 1. Product definition and UX feel

HiveLore is a collaborative storytelling and worldbuilding platform built around shared fictional universes. Users do not only publish individual stories; they create connected lore that other people can extend, discuss, vote on, and eventually turn into official canon.

| Area | Definition |
| --- | --- |
| Target users | Creative writers, world-builders, fantasy/sci-fi fans, Hive users, readers who enjoy lore-heavy universes, and communities that want shared stories. |
| Core promise | A world stays organized even when many people contribute, because every contribution is structured, connected to the lore graph, checked by AI, and voted into canon. |
| Feeling to use | Exploratory like a wiki, creative like a writing editor, social like a community platform, and game-like through reputation, canon status, visible contributions, and Hive reward opportunity. |
| Main loop | Discover a world -> read canon -> create or extend lore -> link it to existing entries -> AI checks consistency -> community votes -> canon expands -> more writers build on it. |
| What makes it Hive-native | Hive identity, signed actions, public contribution history, Hive-linked canonical posts, voting engagement, reputation visibility, and reward eligibility for valuable contributions. |

## 1.1 Product principles

- Canon should be structured, transparent, and community-driven instead of controlled by one person forever.
- AI should assist, warn, summarize, and connect ideas, but it should not become the final author or final judge.
- Every contribution should create traceable credit for the writer and clear relationships inside the lore graph.
- The MVP should feel usable without advanced maps, councils, NFTs, or complex reward analytics.
- Readers should understand a world quickly before they decide to contribute.

# 2. Core lore entities and relationships

The entity model should be shared with the technical architecture track. Product/design should define what each entity means and how users experience it; technical track should translate it into database tables, APIs, and Hive metadata.

![Entity Relationship Diagram](images/Entity%20Relationship%20Diagram.png)

Figure 1. Lore entity relationship diagram. LoreEntry is the reusable base object for characters, cities/kingdoms, factions, quests, historical events, artifacts, and story contributions. Relationships turn individual entries into a searchable world graph.

# 3. User roles and permissions

The product can describe roles in user language, while the backend can implement them as permissions. A user may have different roles in different worlds. For example, a user can be a founder in one world and a normal contributor in another.

| Role | Can do | Cannot / limits |
| --- | --- | --- |
| Reader / Explorer | Browse public worlds, read canon, search, view profiles, view vote history, ask basic AI lore questions if logged in. | Cannot create canon directly; cannot moderate; may need Hive login to vote/comment. |
| Contributor / Writer | Create drafts, submit proposals, write story continuations, create characters/factions/cities/events/quests, link entries to existing canon, revise after feedback. | Cannot canonize own work alone; must pass AI check and community vote. |
| World-builder / Founder | Create new world, define World Seed and World Bible, set tone/rules, recommend direction, comment with founder badge, maintain starter canon. | Not absolute final authority after launch; community vote and AI visibility remain central. |
| Curator / Moderator | Review reports, hide spam/abuse, review AI-warning proposals, resolve duplicate entries, enforce platform rules, help mark decision outcomes after thresholds. | Should not silently override community decisions; actions need audit trail. |
| Admin | Manage platform settings, global categories, blocked content, system health, abuse cases. | Platform-level only; not a creative canon owner. |
| AI Assistant | Checks consistency, suggests links, explains contradictions, helps users write, summarizes lore. | Cannot approve canon alone; outputs are suggestions/warnings. |

| Permission | Reader | Contributor | World-builder / Founder | Curator / Moderator |
| --- | --- | --- | --- | --- |
| View public world | Yes | Yes | Yes | Yes |
| Create lore draft | No | Yes | Yes | Yes |
| Submit proposal | No | Yes | Yes | Yes |
| Create new world | No | Optional / if allowed | Yes | Optional |
| Edit own draft | No | Yes | Yes | Yes |
| Edit canon directly | No | No | Only initial seed/bible or proposed revisions | No, except moderation fixes |
| Vote on proposal | Logged-in readers only | Yes | Yes, but founder badge visible | Yes |
| Approve canon alone | No | No | No | No, except executing rule-based status after threshold |
| Mark spam/abuse | Report only | Report only | Report only | Yes |
| Resolve AI-warning queue | No | No | Comment/recommend | Yes |

# 4. Canon voting model and branching lore

![Canon Voting Model](images/Canon%20Voting%20Model.png)

Figure 2. Canon workflow. A proposal can become canon when it passes AI consistency visibility and community approval, or remain readable as an alternate timeline if it conflicts with main canon

## 4.1 Canon status definitions

| Status | Meaning | When used |
| --- | --- | --- |
| Draft | Private or unfinished content visible to creator only. | Creator is still editing. |
| Proposal | Public to the world community but not official. | Submitted after AI check. |
| AI Warning | Proposal has a visible unresolved contradiction. | Contradiction is major but user chose to submit anyway. |
| Under Review | Proposal has enough attention and is near decision. | Vote window active or threshold close. |
| Canon | Official part of the world. Future proposals can build on it. | Approval threshold met and AI warning handled. |
| Rejected | Not accepted into main canon. | Insufficient support, spam, poor fit, or unresolved issue. |
| Alternate Timeline | Readable branch that is not main canon. | Useful creative branch or conflict accepted outside main continuity. |
| Archived | Old or inactive entry kept for record. | Superseded, outdated, or preserved for transparency. |

## 4.2 MVP canon rule

- A contribution starts as Draft, then runs through AI Check before becoming a Proposal.
- MVP default threshold: at least 5 total internal votes, at least 70% approval, and a 48-hour voting window before canonization.
- Votes can be Approve, Reject, Needs Revision, or Mark as Alternate Timeline. Approval percentage should count Approve against Approve + Reject. Needs Revision is feedback, not approval.
- The AI report is visible during voting. A major unresolved warning does not automatically block submission, but it must stay attached to the proposal.
- If the proposal passes approval but has a major AI warning, a curator/moderator can either request revision, allow canon with warning acknowledged, or move it to Alternate Timeline based on community response.
- Founder comments should be highlighted, but the founder should not have absolute final power after the world launches.

## 4.3 Conflict and branching rules

| Conflict type | Handling | Example |
| --- | --- | --- |
| Minor style mismatch | AI suggests edits; proposal can still go to vote. | Example: name style slightly different from world naming rules. |
| Major contradiction | Proposal gets AI Warning label; user can revise or submit with warning. | Example: dead ruler appears alive after confirmed death. |
| Timeline conflict | Proposal must link to an era/date and show conflict in vote screen. | Example: city is destroyed in Year 400 but used as active in Year 405. |
| Branching continuation | Proposal can be marked Branch of an existing story. | Community can vote one branch into main canon, others stay as alternate. |
| Duplicate lore | Curator can merge, archive, or request revision. | Example: two users create same kingdom with conflicting ruler. |
| Community accepts contradiction intentionally | Allowed as canon only if warning is visible and vote threshold passes. | Example: resurrection arc is accepted and becomes new canon event. |

