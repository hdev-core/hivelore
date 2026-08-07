'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/errors';
import { createLoreEntry, deleteLoreEntry, updateLoreEntry, type LoreEntry } from '@/lib/api/lore';
import { getStoredAccessToken } from '@/lib/api/session';
import { loreTypes, type LoreType } from '@/lib/worlds/constants';

import {
  getLoreTypeOptionFromApiType,
  getEntryBody,
  getEntryFields,
  getEntryRelationships,
  getEntrySummary,
  getEntryTags,
  statusOptions,
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
  RULE: [
    { key: 'scope', label: 'Scope', placeholder: 'Where this rule applies.' },
    { key: 'limit', label: 'Limit', placeholder: 'What this rule prevents or permits.' },
  ],
};

function listToLines(items: string[]) {
  return items.join('\n');
}

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

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
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(fields);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entityType, setEntityType] = useState(
    () => getLoreTypeOptionFromApiType(entry?.loreType ?? initialType, entry?.content).type,
  );
  const [relationships, setRelationships] = useState(() =>
    listToLines(getEntryRelationships(entry ?? { content: null })),
  );
  const [status, setStatus] = useState(entry?.status ?? 'DRAFT');
  const [summary, setSummary] = useState(() => getEntrySummary(entry ?? { content: null }));
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
      body.trim().length > 0 &&
      !isSubmitting,
    [body, isSubmitting, summary, title],
  );

  function updateField(key: string, value: string) {
    setFieldValues((current) => ({
      ...current,
      [key]: value,
    }));
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
          relationships: linesToList(relationships),
          summary: summary.trim(),
          entityType,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
        loreType,
        status,
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
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Connected lore
                <Textarea
                  onChange={(event) => setRelationships(event.target.value)}
                  placeholder="One related entry or relationship per line"
                  rows={4}
                  value={relationships}
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
            <label className="grid gap-2 text-sm font-semibold">
              Workflow state
              <Select
                onChange={(event) => setStatus(event.target.value as typeof status)}
                value={status}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          </CardContent>
        </Card>
      </section>

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
