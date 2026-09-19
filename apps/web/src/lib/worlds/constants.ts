import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

export type LoreCategory =
  | 'characters'
  | 'cities-kingdoms'
  | 'factions'
  | 'quests'
  | 'historical-events'
  | 'stories-contributions';

export type LoreType =
  | 'CHARACTER'
  | 'LOCATION'
  | 'FACTION'
  | 'QUEST'
  | 'EVENT'
  | 'STORY'
  | 'ARTIFACT'
  | 'HISTORY'
  | 'RULE'
  | 'OTHER';

export type CanonEntryStatus = NonNullable<ComponentProps<typeof Badge>['variant']>;

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
  { id: 'cities-kingdoms', label: 'Cities/Kingdoms' },
  { id: 'factions', label: 'Factions' },
  { id: 'quests', label: 'Quests' },
  { id: 'historical-events', label: 'Historical Events' },
  { id: 'stories-contributions', label: 'Stories/Contributions' },
];

export const loreTypes: Array<{
  apiType: LoreType;
  categoryId: LoreCategory;
  label: string;
  type: string;
}> = [
  { apiType: 'CHARACTER', categoryId: 'characters', label: 'Character', type: 'CHARACTER' },
  {
    apiType: 'LOCATION',
    categoryId: 'cities-kingdoms',
    label: 'City/Kingdom',
    type: 'CITY_KINGDOM',
  },
  { apiType: 'FACTION', categoryId: 'factions', label: 'Faction', type: 'FACTION' },
  { apiType: 'QUEST', categoryId: 'quests', label: 'Quest', type: 'QUEST' },
  {
    apiType: 'EVENT',
    categoryId: 'historical-events',
    label: 'Historical Event',
    type: 'HISTORICAL_EVENT',
  },
  {
    apiType: 'STORY',
    categoryId: 'stories-contributions',
    label: 'Story/Contribution',
    type: 'STORY_CONTRIBUTION',
  },
];
