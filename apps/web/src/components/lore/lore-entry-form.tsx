'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/errors';
import {
  createLoreEntry,
  createLoreRelationship,
  deleteLoreEntry,
  deleteLoreRelationship,
  listLoreEntries,
  updateLoreEntry,
  type LoreEntry,
} from '@/lib/api/lore';
import { getStoredAccessToken } from '@/lib/api/session';
import { loreTypes, type LoreType } from '@/lib/worlds/constants';

import {
  getLoreTypeOptionFromApiType,
  getEntryBody,
  getEntryFields,
  getEntrySummary,
  getEntryTags,
  getReadableBodyText,
} from './lore-utils';

const defaultLoreTypeOption = loreTypes[0]!;

type LoreEntryFormProps = {
  entry?: LoreEntry | null;
  initialType: LoreType;
  mode: 'create' | 'edit';
  worldId: string;
};

type FieldDefinition = {
  key: string;
  label: string;
  placeholder: string;
};

const fieldDefinitions: Record<LoreType, FieldDefinition[]> = {
  ARTIFACT: [
    { key: 'origin', label: 'Origin', placeholder: 'Who made it, found it, or lost it?' },
    { key: 'power', label: 'Power or purpose', placeholder: 'What does it do in the world?' },
  ],
  CHARACTER: [
    { key: 'role', label: 'Role', placeholder: 'Protagonist, ruler, witness, mentor...' },
    { key: 'motivation', label: 'Motivation', placeholder: 'What does this character want?' },
  ],
  EVENT: [
    { key: 'era', label: 'Era or date', placeholder: 'Year 401, Age of Ash, before launch...' },
    { key: 'impact', label: 'Impact', placeholder: 'What changed because of this event?' },
  ],
  FACTION: [
    { key: 'agenda', label: 'Agenda', placeholder: 'What is this faction trying to achieve?' },
    { key: 'territory', label: 'Territory', placeholder: 'Where do they operate?' },
  ],
  HISTORY: [
    { key: 'period', label: 'Period', placeholder: 'The span of time this history covers.' },
    { key: 'legacy', label: 'Legacy', placeholder: 'How people remember or dispute it.' },
  ],
  LOCATION: [
    { key: 'ruler', label: 'Ruler or authority', placeholder: 'Who governs this city or kingdom?' },
    { key: 'region', label: 'Region', placeholder: 'Kingdom, district, planet, frontier...' },
  ],
  OTHER: [
    { key: 'goal', label: 'Goal', placeholder: 'What is the quest or story trying to resolve?' },
    { key: 'stakes', label: 'Stakes', placeholder: 'What changes if it succeeds or fails?' },
  ],
  QUEST: [
    { key: 'goal', label: 'Goal', placeholder: 'What is this quest trying to resolve?' },
    { key: 'stakes', label: 'Stakes', placeholder: 'What changes if it succeeds or fails?' },
  ],
  RULE: [
    { key: 'scope', label: 'Scope', placeholder: 'Where this rule applies.' },
    { key: 'limit', label: 'Limit', placeholder: 'What this rule prevents or permits.' },
  ],
  STORY: [
    { key: 'arc', label: 'Arc', placeholder: 'What story arc does this belong to?' },
    { key: 'focus', label: 'Focus', placeholder: 'Which lore thread does it advance?' },
  ],
};

const relationshipTypes = [
  { label: 'Allied with', value: 'allied_with' },
  { label: 'Enemy of', value: 'enemy_of' },
  { label: 'Member of', value: 'member_of' },
  { label: 'Rules', value: 'rules' },
  { label: 'Located in', value: 'located_in' },
  { label: 'Involved in', value: 'involved_in' },
  { label: 'Created by', value: 'created_by' },
  { label: 'Related to', value: 'related_to' },
];

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'The lore entry could not be saved.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'The lore entry could not be saved.';
}

export function LoreEntryForm({ entry = null, initialType, mode, worldId }: LoreEntryFormProps) {
  const router = useRouter();
  const fields = getEntryFields(entry ?? { content: null });
  const [body, setBody] = useState(() => getEntryBody(entry ?? { content: null }));
  const [currentEntry, setCurrentEntry] = useState<LoreEntry | null>(entry);
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(fields);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entityType, setEntityType] = useState(
    () => getLoreTypeOptionFromApiType(entry?.loreType ?? initialType, entry?.content).type,
  );
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [relationType, setRelationType] = useState(relationshipTypes[0]!.value);
  const [summary, setSummary] = useState(() => getEntrySummary(entry ?? { content: null }));
  const [targetEntries, setTargetEntries] = useState<LoreEntry[]>([]);
  const [targetId, setTargetId] = useState('');
  const [tags, setTags] = useState(() => getEntryTags(entry ?? { content: null }).join(', '));
  const [title, setTitle] = useState(entry?.title ?? '');

  const selectedTypeOption =
    loreTypes.find((option) => option.type === entityType) ?? defaultLoreTypeOption;
  const loreType = selectedTypeOption.apiType;
  const activeFields = fieldDefinitions[loreType];
  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      summary.trim().length > 0 &&
      getReadableBodyText(body).length > 0 &&
      !isSubmitting,
    [body, isSubmitting, summary, title],
  );

  function updateField(key: string, value: string) {
    setFieldValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  useEffect(() => {
    if (!currentEntry) {
      return;
    }

    let isActive = true;

    async function loadTargets(currentEntry: LoreEntry) {
      const accessToken = getStoredAccessToken();

      if (!accessToken || currentEntry.status !== 'DRAFT') {
        setTargetEntries([]);
        setTargetId('');
        setIsLoadingTargets(false);
        return;
      }

      setIsLoadingTargets(true);
      setRelationshipError(null);

      try {
        const [draftResponse, canonResponse] = await Promise.all([
          listLoreEntries(worldId, { status: 'DRAFT' }, accessToken),
          listLoreEntries(worldId, {}, accessToken),
        ]);
        const candidatesById = new Map(
          [...draftResponse.entries, ...canonResponse.entries].map((candidate) => [
            candidate.id,
            candidate,
          ]),
        );
        const linkedTargetIds = new Set(
          currentEntry.outgoingRelations?.map((relationship) => relationship.target?.id) ?? [],
        );
        const availableTargets = [...candidatesById.values()].filter(
          (candidate) => candidate.id !== currentEntry.id && !linkedTargetIds.has(candidate.id),
        );

        if (isActive) {
          setTargetEntries(availableTargets);
          setTargetId(availableTargets[0]?.id ?? '');
        }
      } catch (nextError) {
        if (isActive) {
          setRelationshipError(getErrorMessage(nextError));
        }
      } finally {
        if (isActive) {
          setIsLoadingTargets(false);
        }
      }
    }

    loadTargets(currentEntry);

    return () => {
      isActive = false;
    };
  }, [currentEntry, worldId]);

  async function handleAddRelationship() {
    if (!currentEntry || !targetId) {
      return;
    }

    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      setRelationshipError('Please sign in before linking lore.');
      return;
    }

    setRelationshipError(null);
    setIsLinking(true);

    try {
      const response = await createLoreRelationship(
        worldId,
        currentEntry.id,
        {
          relationType,
          targetId,
        },
        accessToken,
      );
      setCurrentEntry((latestEntry) =>
        latestEntry
          ? {
              ...latestEntry,
              outgoingRelations: [...(latestEntry.outgoingRelations ?? []), response.relationship],
            }
          : latestEntry,
      );
      setTargetId('');
    } catch (nextError) {
      setRelationshipError(getErrorMessage(nextError));
    } finally {
      setIsLinking(false);
    }
  }

  async function handleDeleteRelationship(relationshipId: string) {
    if (!currentEntry) {
      return;
    }

    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      setRelationshipError('Please sign in before unlinking lore.');
      return;
    }

    setRelationshipError(null);
    setIsLinking(true);

    try {
      await deleteLoreRelationship(worldId, currentEntry.id, relationshipId, accessToken);
      setCurrentEntry((latestEntry) =>
        latestEntry
          ? {
              ...latestEntry,
              outgoingRelations: (latestEntry.outgoingRelations ?? []).filter(
                (relationship) => relationship.id !== relationshipId,
              ),
            }
          : latestEntry,
      );
    } catch (nextError) {
      setRelationshipError(getErrorMessage(nextError));
    } finally {
      setIsLinking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      setError('Please sign in before saving lore.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        content: {
          body,
          fields: Object.fromEntries(
            Object.entries(fieldValues).filter(([, value]) => value.trim().length > 0),
          ),
          summary: summary.trim(),
          entityType,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
        loreType,
        title: title.trim(),
      };

      const response =
        mode === 'edit' && entry
          ? await updateLoreEntry(worldId, entry.id, payload, accessToken)
          : await createLoreEntry(worldId, payload, accessToken);

      router.push(`/worlds/${worldId}/lore/${response.entry.id}`);
      router.refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!entry) {
      return;
    }

    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      setError('Please sign in before deleting lore.');
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteLoreEntry(worldId, entry.id, accessToken);
      router.push(`/worlds/${worldId}`);
      router.refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error ? (
        <Alert variant="danger">
          <AlertTitle>Lore was not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{mode === 'edit' ? 'Edit lore entry' : 'Create lore entry'}</CardTitle>
            <CardDescription>
              Structured canon fields for the six M2 lore entity types.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Entity title
                <Input
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Lighthouse Keeper Oath"
                  required
                  value={title}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Entity type
                <Select
                  onChange={(event) => setEntityType(event.target.value)}
                  required
                  value={entityType}
                >
                  {loreTypes.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Short summary
                <Textarea
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="One or two sentences readers can scan from the world hub."
                  required
                  rows={3}
                  value={summary}
                />
              </label>
              {activeFields.map((field) => (
                <label className="grid gap-2 text-sm font-semibold" key={field.key}>
                  {field.label}
                  <Input
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    value={fieldValues[field.key] ?? ''}
                  />
                </label>
              ))}
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Tags
                <Input
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="canon, sea-road, oath"
                  value={tags}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card variant="muted">
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Keep drafts separate from published canon.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {entry?.status ?? 'DRAFT'} entries stay draft-only here; canon publication goes
              through proposals and voting.
            </p>
          </CardContent>
        </Card>
      </section>

      {currentEntry ? (
        <Card>
          <CardHeader>
            <CardTitle>Relationship graph</CardTitle>
            <CardDescription>
              {currentEntry.status === 'DRAFT'
                ? 'Link this draft to draft or published canon lore.'
                : 'Published canon relationships go through proposals and voting.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {relationshipError ? (
              <Alert className="mb-4" variant="warning">
                <AlertTitle>Relationship was not saved</AlertTitle>
                <AlertDescription>{relationshipError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
              <Select
                aria-label="Relationship type"
                onChange={(event) => setRelationType(event.target.value)}
                value={relationType}
              >
                {relationshipTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Target lore entry"
                disabled={
                  currentEntry.status !== 'DRAFT' || isLoadingTargets || !targetEntries.length
                }
                onChange={(event) => setTargetId(event.target.value)}
                value={targetId}
              >
                {targetEntries.length ? (
                  targetEntries.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.title}
                    </option>
                  ))
                ) : (
                  <option value="">No linkable targets yet</option>
                )}
              </Select>
              <Button
                disabled={currentEntry.status !== 'DRAFT' || !targetId || isLinking}
                isLoading={isLinking}
                onClick={handleAddRelationship}
                type="button"
                variant="secondary"
              >
                Link
              </Button>
            </div>

            {currentEntry.outgoingRelations?.length ? (
              <ul className="mt-5 space-y-3">
                {currentEntry.outgoingRelations.map((relationship) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border p-3 text-sm"
                    key={relationship.id}
                  >
                    <span>
                      <span className="font-semibold">
                        {relationship.relationType.replaceAll('_', ' ')}
                      </span>{' '}
                      {relationship.target?.title}
                    </span>
                    {currentEntry.status === 'DRAFT' ? (
                      <Button
                        disabled={isLinking}
                        onClick={() => handleDeleteRelationship(relationship.id)}
                        type="button"
                        variant="outline"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                No outgoing relationships yet.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <RichTextEditor
            initialContent={body}
            key={entry?.id ?? 'new-entry'}
            label="Main description"
            onChange={setBody}
            placeholder="Write the readable canon body, contradictions, limits, and hooks here..."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button disabled={!canSubmit} isLoading={isSubmitting} type="submit" variant="hive">
          {mode === 'edit' ? 'Save changes' : 'Create entry'}
        </Button>
        {entry ? (
          <Button isLoading={isDeleting} onClick={handleDelete} type="button" variant="danger">
            Delete entry
          </Button>
        ) : null}
        <Button onClick={() => router.push(`/worlds/${worldId}`)} type="button" variant="outline">
          Back to world
        </Button>
      </div>
    </form>
  );
}
