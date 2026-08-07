import type { ComponentProps } from 'react';

import type { Badge } from '@/components/ui/badge';
import type { LoreEntry, LoreEntryContent, LoreStatus } from '@/lib/api/lore';
import { loreTypes, type LoreCategory, type LoreType } from '@/lib/worlds/constants';

export const statusOptions: Array<{ label: string; value: LoreStatus }> = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Approved', value: 'APPROVED_FOR_PUBLICATION' },
  { label: 'Canon', value: 'PUBLISHED_CANON' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export function getLoreTypeLabel(loreType: string) {
  return (
    loreTypes.find((option) => option.type === loreType || option.apiType === loreType)?.label ??
    loreType.replaceAll('_', ' ')
  );
}

export function getLoreTypeFromCategory(categoryId: LoreCategory) {
  return loreTypes.find((option) => option.categoryId === categoryId)?.apiType ?? 'CHARACTER';
}

export function getLoreTypeFromQuery(type: string | string[] | undefined): LoreType {
  const rawType = Array.isArray(type) ? type[0] : type;
  const byCategory = loreTypes.find((option) => option.categoryId === rawType);
  const byType = loreTypes.find((option) => option.type === rawType || option.apiType === rawType);

  return byCategory?.apiType ?? byType?.apiType ?? 'CHARACTER';
}

export function getCardEntityTypeFromApiType(loreType: LoreType, content: unknown) {
  if (isLoreEntryContent(content) && typeof content.entityType === 'string') {
    return content.entityType;
  }

  return loreTypes.find((option) => option.apiType === loreType)?.type ?? loreType;
}

export function getLoreTypeOptionFromApiType(loreType: LoreType, content: unknown) {
  const cardEntityType = getCardEntityTypeFromApiType(loreType, content);
  const fallback = loreTypes[0]!;

  return (
    loreTypes.find((option) => option.type === cardEntityType) ??
    loreTypes.find((option) => option.apiType === loreType) ??
    fallback
  );
}

export function getStatusLabel(status: string) {
  return (
    statusOptions.find((option) => option.value === status)?.label ?? status.replaceAll('_', ' ')
  );
}

export function getStatusBadgeVariant(
  status: string,
): NonNullable<ComponentProps<typeof Badge>['variant']> {
  if (status === 'DRAFT') {
    return 'draft';
  }

  if (status === 'SUBMITTED') {
    return 'proposal';
  }

  if (status === 'APPROVED_FOR_PUBLICATION') {
    return 'canon-approved';
  }

  if (status === 'PUBLISHED_CANON') {
    return 'canon';
  }

  if (status === 'ARCHIVED') {
    return 'archived';
  }

  return 'neutral';
}

export function isLoreEntryContent(content: unknown): content is LoreEntryContent {
  return Boolean(content) && typeof content === 'object' && !Array.isArray(content);
}

export function getEntrySummary(entry: Pick<LoreEntry, 'content'>) {
  if (!isLoreEntryContent(entry.content)) {
    return '';
  }

  return typeof entry.content.summary === 'string' ? entry.content.summary : '';
}

export function getEntryBody(entry: Pick<LoreEntry, 'content'>) {
  if (!isLoreEntryContent(entry.content)) {
    return '';
  }

  return typeof entry.content.body === 'string' ? entry.content.body : '';
}

export function getEntryTags(entry: Pick<LoreEntry, 'content'>) {
  if (!isLoreEntryContent(entry.content) || !Array.isArray(entry.content.tags)) {
    return [];
  }

  return entry.content.tags.filter((tag): tag is string => typeof tag === 'string');
}

export function getEntryFields(entry: Pick<LoreEntry, 'content'>) {
  if (!isLoreEntryContent(entry.content) || !entry.content.fields) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(entry.content.fields).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
}

export function getEntryRelationships(entry: Pick<LoreEntry, 'content'>) {
  if (!isLoreEntryContent(entry.content) || !Array.isArray(entry.content.relationships)) {
    return [];
  }

  return entry.content.relationships.filter(
    (relationship): relationship is string => typeof relationship === 'string',
  );
}
