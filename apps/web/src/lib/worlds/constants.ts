import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';

export type LoreCategory =
  'characters' | 'cities' | 'factions' | 'quests' | 'events' | 'stories' | 'artifacts';

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
  { id: 'cities', label: 'Cities/Kingdoms' },
  { id: 'factions', label: 'Factions' },
  { id: 'quests', label: 'Quests' },
  { id: 'events', label: 'Historical Events' },
  { id: 'stories', label: 'Stories' },
  { id: 'artifacts', label: 'Artifacts' },
];
