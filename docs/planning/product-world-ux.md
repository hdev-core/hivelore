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
