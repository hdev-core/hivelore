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

# 5. Reputation system

![Reputation Loop](images/Reputation%20Loop.png)

Reputation should make good contributors visible without making the MVP too complex. For v1, reputation should mostly be profile recognition and sorting. Weighted voting can be future scope once abuse controls are stronger.

| Reputation type | What it measures | MVP scoring idea |
| --- | --- | --- |
| Writer Reputation | Quality of stories and lore proposals. | Canonized contribution +25; approved proposal +10; high approval ratio +5; repeated rejected spam -10. |
| World-builder Reputation | Ability to create useful connected world structures. | World reaches 10 canon entries +20; high contributor retention +15; clear World Bible +10. |
| Curator Reputation | Helpful governance and moderation quality. | Resolved reports +5; helpful review accepted by creator +3; abusive moderation -20. |
| Community Reputation | Healthy participation as reader/voter/commenter. | Helpful comments +2; accurate flags +3; vote brigading or spam -15. |

## 5.1 Levels and profile badges

| Score range | Level | Meaning |
| --- | --- | --- |
| 0-49 | New Scribe | New user; can read, vote, and submit proposals. |
| 50-149 | Lore Crafter | Several accepted contributions; profile badge. |
| 150-399 | Canon Builder | Trusted contributor with multiple canonized entries. |
| 400+ | World Steward | High-quality contributor; may be nominated for curator-style duties in future. |

# 6. Core features and MVP cut

| Feature | MVP decision | Reason |
| --- | --- | --- |
| Hive login | MVP | Required because product is built around Hive identity. |
| World browsing and World Hub | MVP | Users need to discover worlds and understand them quickly. |
| World Seed + World Bible creation | MVP | This is the foundation for every world and for AI consistency checks. |
| Lore entity creation | MVP | Support core types: Character, City/Kingdom, Faction, Quest, Historical Event, Story/Contribution. |
| Relationship linking | MVP | Required to create a lore graph instead of isolated posts. |
| Contribution editor | MVP | Needed for writers to submit structured content and stories. |
| AI consistency check | MVP | Core differentiator; warns before voting. |
| Canon voting | MVP | Core governance loop. |
| Basic reputation profile | MVP | Gives writers recognition and shows contribution history. |
| Comments / feedback | MVP light | Needed around proposals and votes, but can be simple. |
| Search and filters | MVP light | Basic filters by world/type/status/tags. Advanced graph search later. |
| Timeline | V1 after MVP | Useful but can start as simple chronological list. |
| Map | V1 after MVP | Start as placeholder/list of locations; advanced interactive map later. |
| Hive posting/linking | MVP or early V1 | Canon or featured content should be linkable to Hive posts; full streamer can be later. |
| Rewards dashboard | Future | Rewards are opportunity-based and can be added after core loop works. |
| World councils / elected stewards | Future | Too complex for MVP governance. |
| Advanced AI lore chatbot | Future | Basic AI summaries can exist, full Q&A can come after structured lore grows. |
| NFT collectibles | Future | Not needed to prove product value. |


# 7. Primary user journeys

## Journey A - Founder creates a world

1. User logs in with Hive.
1. Clicks Create New World.
1. Completes World Seed: genre, tone, conflict, first location, first characters, first factions, first event.
1. Writes World Bible with rules and writing style.
1. Publishes world. System marks seed as canon.
1. World Hub opens with starter canon and contribution button.

| Success outcome<br>A public world exists with starter canon, clear tone, and enough structure for others to contribute. |
| --- |

## Journey B - Writer creates a character

1. Writer opens a world.
1. Clicks Create Contribution.
1. Chooses Character.
1. Adds name, role, faction, location, status, motivation, and body text.
1. Links character to existing faction/city/event.
1. Runs AI check.
1. Submits proposal for vote.

| Success outcome<br>Character proposal is visible with related entries, AI report, and voting controls. |
| --- |

## Journey C - Others extend a character into a story thread

1. Reader opens the character page.
1. Clicks Extend this character.
1. Chooses Story/Contribution.
1. Writes a chapter using the character.
1. Marks it as continuation of an existing story or starts a new thread.
1. AI checks continuity.
1. Community comments and votes.

| Success outcome<br>A story branch is connected to the character and can become canon or alternate timeline. |
| --- |

## Journey D - Canon vote decision

1. Community sees proposal in Active Votes.
1. Users read summary, full text, related lore, and AI report.
1. Users vote Approve, Reject, Needs Revision, or Alternate.
1. System tracks approval percentage and minimum vote count.
1. After voting window, system moves proposal to Canon, Rejected, Needs Revision, or Alternate Timeline.

| Success outcome<br>Decision is visible, explainable, and stored in proposal history. |
| --- |

## Journey E - Conflict handling

1. Writer submits content that conflicts with canon.
1. AI detects issue and explains source conflict.
1. Writer revises or submits with AI Warning label.
1. Voters see warning while voting.
1. If accepted as intentional change, it can become canon; otherwise it becomes rejected or alternate.

| Success outcome<br>Contradictions are not hidden; they become part of a transparent decision process. |
| --- |

## Journey F - Reader explores before contributing

1. Reader opens World Hub.
1. Reads summary and World Bible highlights.
1. Filters canon entries by characters/factions/events.
1. Opens timeline/map preview.
1. Follows related entries.
1. Decides where to contribute.

| Success outcome<br>New users understand the world without reading every entry manually. |
| --- |


# 8. Wireframes and key screen specs

These low-fidelity wireframes align the main product flow before visual design. Each image is paired with the required screen content and the user outcome it should support.

## 8.1 World Hub Screen

![World Hub Screen](images/wireframes/1.%20World%20Hub%20Wireframe.png)

Main page for one fictional world. It should help a reader understand the world's identity, canon health, active proposals, and next actions without needing to open several pages first.

Purpose: Main page for one fictional world.

Must include:
- Top navigation with HiveLore logo placeholder, search bar, and Hive login/profile area.
- World title, genre, tone, and short summary.
- World Seed section.
- World Codex preview section.
- Canon status overview.
- Tabs or filters: Characters, Cities/Kingdoms, Factions, Quests, Historical Events, Stories, Artifacts.
- Featured canon entries.
- Pending proposals needing votes.
- CTA buttons: Create Lore Entry, Write Story Contribution, View Timeline, View Map.
- Small AI guide panel: Ask about this world.

UX goal: Readers should understand the world in under one minute and know whether to read, vote, or contribute.

## 8.2 Lore Entity Page

![Lore Entity Page](images/wireframes/2.%20Lore%20Entity%20Wireframe.png)

Detail page for one lore object, such as a character, city, faction, quest, historical event, story, or artifact. The page should make the entry readable on its own while exposing how it connects to the wider lore graph.

Purpose: Detail page for one lore entity.

Must include:
- Entity title and type.
- Canon status badge: Draft, Proposal, AI Warning, Under Review, Canon, Rejected, Alternate Timeline, Archived.
- Short summary.
- Main description/body area.
- Metadata panel: creator, world, created date, tags.
- Connected lore section showing relationships like belongs to, ruled by, enemy of, caused by, continuation of.
- Related entries list.
- Contribution history.
- CTA buttons: Extend this lore, Suggest edit, Start story from this, Vote on proposal.

UX goal: Any entity can become a clear reading endpoint and a natural starting point for new contributions.

## 8.3 Contribution / Story Editor Screen

![Contribution / Story Editor Screen](images/wireframes/3.%20Editor%20Wireframe.png)

Creation screen for new lore proposals and story continuations. The editor should give writers structure without making the writing process feel blocked by forms.

Purpose: User creates a new lore proposal or story continuation.

Must include:
- Entry type selector.
- Title field.
- Structured fields depending on type.
- Rich text editor placeholder.
- Relationship picker to connect the contribution to existing canon lore.
- Tags field.
- AI consistency checker panel.
- AI suggestions panel.
- Buttons: Save Draft, Run AI Check, Submit Proposal.
- Warning state area for contradictions.
- Checkbox or confirmation: Submit with AI Warning label, if the user insists.

UX goal: Writers can create connected lore, run consistency checks, and submit proposals with clear consequences.

## 8.4 Canon Vote Screen

![Canon Vote Screen](images/wireframes/4.%20Canon%20Vote%20Wireframe.png)

Community decision page for whether a proposal becomes canon, needs revision, gets rejected, or branches into an alternate timeline. The screen should make the voting rule and AI report visible before users act.

Purpose: Community votes on whether a proposal becomes canon.

Must include:
- Proposal title, creator, type, and world.
- Current canon status.
- AI consistency report summary.
- Warning label if contradiction exists.
- Vote progress bar showing approval percentage.
- Minimum votes requirement area.
- Voting buttons: Approve, Request Revision, Reject, Mark as Alternate Timeline.
- Comments/discussion section.
- Canon decision panel explaining percentage approval plus AI check.
- Result states: Canon Approved, Rejected, Alternate Timeline, Needs More Votes.

UX goal: Voters can make informed decisions and understand why the final canon outcome happened.

## 8.5 Timeline / Map Screen

![Timeline / Map Screen](docs/planning/wireframes/Map%20Wireframe.png)

Exploration screen for world history and geography. Timeline and map modes should share filters so users can move between when lore happened and where it happened.

Purpose: Explore world history and geography.

Must include:
- Toggle tabs: Timeline / Map.
- Timeline view with chronological events.
- Event cards connected to characters, factions, locations, and quests.
- Map placeholder with location pins.
- Sidebar filters: canon only, proposals, alternate timelines, factions, characters, events.
- Selected item details panel.
- CTA buttons: Create event, Add location, Connect to lore.

UX goal: Readers can understand the world's chronology and geography without losing the links back to canon entries.

## 8.6 User Profile Screen

![User Profile Screen](images/wireframes/6.%20User%20Profile%20Wireframe.png)

Hive identity and reputation page for a contributor. The profile should make creative credit, canon contribution, voting activity, and reward-adjacent activity easy to scan.

Purpose: Show Hive identity, contributions, reputation, and rewards activity.

Must include:
- Hive username and avatar placeholder.
- Role badges: Reader, Contributor/Writer, World-Builder, Curator/Moderator, Founder.
- Reputation score.
- Contribution stats: canon entries, proposals, votes received, stories written.
- Reputation loop summary: quality contribution -> positive votes -> canon approval -> reputation gain -> more visibility.
- User's worlds.
- User's lore entries.
- User's pending proposals.
- Hive reference/reward activity placeholder.
- Tabs: Contributions, Votes, Reputation, Rewards, Worlds.

UX goal: Writers get visible credit and a clear reason to keep making high-quality contributions.

## 8.7 Create World Screen

![Create World Screen](images/wireframes/7.%20Create%20World%20Wireframe.png)

Founder setup page for the first canon layer of a world. It should guide founders toward a useful World Seed and Codex without implying they permanently control all canon decisions.

Purpose: Founder starts a new world.

Must include:
- World name field.
- Genre field.
- Tone field.
- Main conflict field.
- World rules field.
- Starting location field.
- First characters field.
- First factions field.
- First historical event field.
- World Seed summary.
- World Codex editor placeholder.
- Buttons: Save Draft World, Create World.
- Note: Founder creates the starting canon, but later canon decisions depend on community voting and AI checks.

UX goal: Founders can publish enough starting structure for other writers to contribute confidently.

## 8.8 Browse Worlds Screen

![Browse Worlds Screen](images/wireframes/8.%20Browse%20Worlds%20Wireframe.png)

Discovery page for exploring fictional worlds across HiveLore. The page should make it easy to compare worlds by genre, activity, founder, canon size, and proposal activity.

Purpose: Explore multiple fictional worlds.

Must include:
- Search and filter bar.
- World cards with title, genre, tone, founder, number of canon entries, and number of active proposals.
- Sort options: newest, most active, highest reputation, most canon entries.
- CTA button: Create New World.
- Quick filters: fantasy, sci-fi, political fantasy, dark fantasy, mystery, adventure.

UX goal: New and returning users can quickly find active worlds worth reading, voting on, or joining.

# 9. V1 out-of-scope list

- Advanced interactive maps with custom fantasy geography editing.
- Full AI lore chatbot with deep natural-language Q&A over every world.
- Political/military AI world engine, war reports, spy dispatches, and simulation-style outputs.
- NFT ownership, collectible lore artifacts, or character ownership mechanics.
- Reputation-weighted voting and complex elected councils.
- Full reward analytics dashboard and advanced beneficiary split configuration.
- Mobile app; v1 should be responsive web only.
- Real-time collaborative editing inside the story editor.
- Private worlds, paid worlds, or invite-only communities unless time remains.
- Complex moderation appeal system; start with simple report/review actions.

| Why cut these?<br>The first version must prove the core loop: create world -> create connected lore -> AI check -> community vote -> canon status -> profile recognition. Anything that does not support that loop should wait. |
| --- |

# 10. Prioritized backlog

Priorities: P0 = must have for MVP demo, P1 = strong v1 feature if time allows, P2 = future/advanced. Acceptance criteria are written in a product-friendly way so they can become development tasks later.

| ID | Feature | Priority | User story | Acceptance criteria |
| --- | --- | --- | --- | --- |
| HL-01 | Hive login | P0 | As a user, I can log in with my Hive account so my identity is tied to contributions. | Login button signs request; profile shows Hive username; no password stored. |
| HL-02 | World Hub | P0 | As a reader, I can browse a world and understand its tone, rules, and canon entries. | World page shows summary, World Bible preview, stats, filters, active proposals. |
| HL-03 | Create World Seed | P0 | As a founder, I can create the structured starting foundation for a world. | Form includes name, genre, tone, conflict, first location, characters, factions, event. |
| HL-04 | World Bible Editor | P0 | As a founder, I can write a rich guide for contributors. | Rich text saved; visible on hub; referenced by AI check. |
| HL-05 | Create Lore Entry | P0 | As a writer, I can create characters, city/kingdoms, factions, quests, events, and stories. | Each type has structured fields and shared LoreEntry metadata. |
| HL-06 | Relationship Linking | P0 | As a writer, I can link new lore to existing canon. | Entry creation requires/selects related entries; relation types stored and displayed. |
| HL-07 | AI Consistency Check | P0 | As a writer, I see contradictions before submitting. | AI report shows severity, explanation, sources, suggested fixes. |
| HL-08 | AI Warning Label | P0 | As a voter, I can clearly see if a proposal conflicts with canon. | Warning badge appears on proposal cards and vote page. |
| HL-09 | Proposal Submission | P0 | As a writer, I can submit my draft for community review. | Draft becomes proposal; appears in active vote list. |
| HL-10 | Canon Voting | P0 | As a logged-in user, I can vote on proposals. | Vote options save once per user; approval percentage is calculated. |
| HL-11 | Canon Status Workflow | P0 | As the platform, I can move proposal through statuses. | Statuses include draft, proposal, warning, under review, canon, rejected, alternate, archived. |
| HL-12 | Entity Page | P0 | As a reader, I can view one lore entry and its connected lore. | Shows body, status, creator, related entries, stories, extend button. |
| HL-13 | Basic Profile | P0 | As a user, I can see my Hive identity, contributions, votes, and reputation. | Profile lists contribution counts, canonized entries, badges. |
| HL-14 | Comments on Proposals | P1 | As a community member, I can leave feedback before voting ends. | Comments appear on vote screen; users can discuss revisions. |
| HL-15 | Basic Search / Filters | P1 | As a reader, I can filter lore by type, status, tag, and world. | Search returns matching entries with status/type chips. |
| HL-16 | Timeline List | P1 | As a reader, I can see historical events in order. | Timeline shows events with dates/eras and linked entries. |
| HL-17 | Map Placeholder | P1 | As a reader, I can view locations in a simple map/list. | Locations display coordinates/region notes; advanced map deferred. |
| HL-18 | Alternate Timeline Support | P1 | As a writer, I can create a branch that does not break canon. | Story can be marked branch_of; status Alternate Timeline visible. |
| HL-19 | Hive Post Linking | P1 | As a canon contributor, I can link or publish approved content to Hive. | Canon content stores author/permlink/metadata reference. |
| HL-20 | Moderation Reports | P1 | As a user, I can report spam or harmful content. | Curator queue shows reports and actions. |
| HL-21 | AI Lore Q&A | P2 | As a newcomer, I can ask questions about a world. | AI answers with source lore references. |
| HL-22 | Advanced Reputation Weighted Voting | P2 | As a world community, trusted users may have more influence. | Weighted rules configurable and transparent. |
| HL-23 | Reward Analytics | P2 | As a contributor, I can see Hive reward activity. | Dashboard tracks Hive-linked posts and beneficiary split. |
| HL-24 | World Councils | P2 | As a mature world, the community can elect stewards. | Council roles and votes are configurable. |
| HL-25 | Advanced MapLibre / Leaflet Map | P2 | As a reader, I can explore an interactive world map. | Map pins, filters, routes, regions, and location pages. |
