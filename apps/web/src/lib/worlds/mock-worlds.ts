import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';

export type WorldSort = 'newest' | 'most-active' | 'highest-reputation' | 'most-canon';

export type LoreCategory =
  'characters' | 'cities' | 'factions' | 'quests' | 'events' | 'stories' | 'artifacts';

export type WorldCard = {
  id: string;
  title: string;
  genre: string;
  tone: string;
  founder: string;
  summary: string;
  createdAt: string;
  activityScore: number;
  founderReputation: number;
  canonEntries: number;
  activeProposals: number;
  tags: string[];
};

export type CanonEntry = {
  id: string;
  title: string;
  type: string;
  summary: string;
  status: NonNullable<ComponentProps<typeof Badge>['variant']>;
};

export type PendingProposal = {
  id: string;
  title: string;
  author: string;
  voteCount: number;
  approvalPercent: number;
  hasAiWarning: boolean;
};

export type WorldDetail = WorldCard & {
  mainConflict: string;
  seed: {
    location: string;
    characters: string[];
    factions: string[];
    firstEvent: string;
  };
  codexPreview: string[];
  canonHealth: {
    label: string;
    value: string;
    detail: string;
  }[];
  featuredCanon: CanonEntry[];
  pendingProposals: PendingProposal[];
  categoryCounts: Record<LoreCategory, number>;
};

export const quickFilters = [
  'fantasy',
  'sci-fi',
  'political fantasy',
  'dark fantasy',
  'mystery',
  'adventure',
];

export const loreCategories: { id: LoreCategory; label: string }[] = [
  { id: 'characters', label: 'Characters' },
  { id: 'cities', label: 'Cities/Kingdoms' },
  { id: 'factions', label: 'Factions' },
  { id: 'quests', label: 'Quests' },
  { id: 'events', label: 'Historical Events' },
  { id: 'stories', label: 'Stories' },
  { id: 'artifacts', label: 'Artifacts' },
];

export const worlds: WorldDetail[] = [
  {
    id: 'ember-crown',
    title: 'The Ember Crown',
    genre: 'Political Fantasy',
    tone: 'Tense, mythic, courtly',
    founder: 'kareem',
    summary:
      'A fractured kingdom chooses its next ruler through prophecy, public memory, and dangerous bargains with old fire.',
    createdAt: '2026-08-01',
    activityScore: 96,
    founderReputation: 410,
    canonEntries: 42,
    activeProposals: 9,
    tags: ['fantasy', 'political fantasy', 'adventure'],
    mainConflict: 'Three houses claim the throne while an exiled oracle rewrites the royal line.',
    seed: {
      location: 'Veyrhold, a mountain capital built around a sleeping volcanic shrine.',
      characters: ['Mara Veyr', 'Orren Blackglass', 'The Ash Oracle'],
      factions: ['The Red Synod', 'House Veyr', 'The Salt Banner'],
      firstEvent: 'The crown cracked during the public coronation and named no heir.',
    },
    codexPreview: [
      'Fire magic is inherited through vows, not blood.',
      'No ruler may enter the Ash Vault without three living witnesses.',
      'Prophecies are legal evidence, but only when recorded by a neutral scribe.',
    ],
    canonHealth: [
      { label: 'Canon status', value: 'Stable', detail: '7 entries added this week' },
      { label: 'Vote queue', value: '9', detail: '3 close to threshold' },
      { label: 'AI warnings', value: '2', detail: 'Both are timeline conflicts' },
    ],
    categoryCounts: {
      characters: 14,
      cities: 5,
      factions: 6,
      quests: 3,
      events: 8,
      stories: 5,
      artifacts: 1,
    },
    featuredCanon: [
      {
        id: 'mara-veyr',
        title: 'Mara Veyr',
        type: 'Character',
        summary: 'Disgraced heir and founder of the public witness compact.',
        status: 'canon',
      },
      {
        id: 'ash-vault',
        title: 'The Ash Vault',
        type: 'Artifact',
        summary: 'A sealed chamber that remembers every broken oath made near the crown.',
        status: 'published-on-hive',
      },
      {
        id: 'salt-banner',
        title: 'The Salt Banner',
        type: 'Faction',
        summary: 'Coastal rebels who reject prophecy as a tool of royal control.',
        status: 'canon',
      },
    ],
    pendingProposals: [
      {
        id: 'oracle-return',
        title: 'The Oracle Returns in Year 411',
        author: 'perla',
        voteCount: 6,
        approvalPercent: 67,
        hasAiWarning: true,
      },
      {
        id: 'salt-banner-heir',
        title: 'A Salt Banner Heir Claims Witness Rights',
        author: 'noura',
        voteCount: 4,
        approvalPercent: 75,
        hasAiWarning: false,
      },
    ],
  },
  {
    id: 'neon-archives',
    title: 'Neon Archives',
    genre: 'Sci-Fi Mystery',
    tone: 'Noir, precise, paranoid',
    founder: 'perla',
    summary:
      'Memory archivists investigate impossible crimes in a city where every public act is supposedly recorded.',
    createdAt: '2026-07-28',
    activityScore: 84,
    founderReputation: 275,
    canonEntries: 31,
    activeProposals: 6,
    tags: ['sci-fi', 'mystery'],
    mainConflict: 'A murder appears in every archive except the victim never existed.',
    seed: {
      location: 'Lumen Quay, an orbital city with transparent streets and sealed memory banks.',
      characters: ['Ivo Senn', 'Archivist Halden', 'Mira-9'],
      factions: ['The Index Court', 'Null Choir', 'Quay Security'],
      firstEvent: 'A dead person filed a memory appeal from inside a corrupted archive.',
    },
    codexPreview: [
      'Public memories can be inspected, but private memories require consent or court order.',
      'Synthetic witnesses must declare model lineage before testimony.',
      'The Null Choir never appears on camera, only in missing timestamps.',
    ],
    canonHealth: [
      { label: 'Canon status', value: 'Growing', detail: 'Strong entity coverage' },
      { label: 'Vote queue', value: '6', detail: '1 needs revision' },
      { label: 'AI warnings', value: '1', detail: 'Identity contradiction' },
    ],
    categoryCounts: {
      characters: 9,
      cities: 3,
      factions: 5,
      quests: 4,
      events: 6,
      stories: 3,
      artifacts: 1,
    },
    featuredCanon: [
      {
        id: 'lumen-quay',
        title: 'Lumen Quay',
        type: 'City',
        summary: 'Orbital city governed through public memory law.',
        status: 'canon',
      },
      {
        id: 'null-choir',
        title: 'Null Choir',
        type: 'Faction',
        summary: 'Anonymous saboteurs who remove events from public recall.',
        status: 'under-review',
      },
    ],
    pendingProposals: [
      {
        id: 'mira-nine-testimony',
        title: 'Mira-9 Gives Contradictory Testimony',
        author: 'kareem',
        voteCount: 5,
        approvalPercent: 80,
        hasAiWarning: true,
      },
    ],
  },
  {
    id: 'river-of-names',
    title: 'River of Names',
    genre: 'Dark Fantasy',
    tone: 'Quiet, haunted, ritual',
    founder: 'sara',
    summary:
      'Villages survive by sending names downriver to bargain with spirits that remember every debt.',
    createdAt: '2026-07-18',
    activityScore: 62,
    founderReputation: 188,
    canonEntries: 18,
    activeProposals: 3,
    tags: ['fantasy', 'dark fantasy'],
    mainConflict:
      'The river returns a forbidden name that should have been erased generations ago.',
    seed: {
      location: 'Namar Ford, a fog-bound crossing where names are traded for safe passage.',
      characters: ['Talin Reed', 'Mother Vess', 'The Nameless Ferryman'],
      factions: ['Ford Keepers', 'Debt Priests'],
      firstEvent: 'A child was born with three names already written on their palms.',
    },
    codexPreview: [
      'Names are living contracts.',
      'A person with no name cannot be harmed by spirits, but cannot be remembered by people.',
      'The river accepts songs, copper, and confessions as partial payment.',
    ],
    canonHealth: [
      { label: 'Canon status', value: 'Sparse', detail: 'Needs more locations' },
      { label: 'Vote queue', value: '3', detail: 'Low risk' },
      { label: 'AI warnings', value: '0', detail: 'No open contradictions' },
    ],
    categoryCounts: {
      characters: 6,
      cities: 2,
      factions: 2,
      quests: 2,
      events: 3,
      stories: 2,
      artifacts: 1,
    },
    featuredCanon: [
      {
        id: 'nameless-ferryman',
        title: 'The Nameless Ferryman',
        type: 'Character',
        summary: 'A river guide who can remember everyone except himself.',
        status: 'canon',
      },
    ],
    pendingProposals: [],
  },
];

export function getWorldById(worldId: string) {
  return worlds.find((world) => world.id === worldId);
}
