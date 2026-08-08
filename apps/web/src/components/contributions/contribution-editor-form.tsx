'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { RichTextEditor, type StructuredEditorContent } from '@/components/editor/rich-text-editor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/errors';
import {
  createContribution,
  submitContribution,
  updateContribution,
  type Contribution,
  type ContributionKind,
} from '@/lib/api/contributions';
import { useAuthSession } from '@/providers/auth-session-provider';

const emptyDocument: StructuredEditorContent = {
  type: 'doc',
  content: [],
};

type ContributionEditorFormProps = {
  initialKind: ContributionKind;
  targetLoreEntryId?: string;
  worldId: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Contribution could not be saved.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Contribution could not be saved.';
}

function hasMeaningfulText(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulText);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  if ('text' in value && typeof value.text === 'string' && value.text.trim()) {
    return true;
  }

  return Object.values(value).some(hasMeaningfulText);
}

export function ContributionEditorForm({
  initialKind,
  targetLoreEntryId,
  worldId,
}: ContributionEditorFormProps) {
  const router = useRouter();
  const { accessToken, isSessionLoading, user } = useAuthSession();
  const [content, setContent] = useState<StructuredEditorContent>(emptyDocument);
  const [draft, setDraft] = useState<Contribution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ContributionKind>(initialKind);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState('');
  const [targetId, setTargetId] = useState(targetLoreEntryId ?? '');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!isSessionLoading && !accessToken) {
      router.replace('/login');
    }
  }, [accessToken, isSessionLoading, router]);

  const canSave = useMemo(
    () => Boolean(accessToken && title.trim() && hasMeaningfulText(content) && !isSaving),
    [accessToken, content, isSaving, title],
  );

  const canSubmit = canSave && !isSubmitting;

  function buildPayload() {
    return {
      content,
      kind,
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      ...(targetId.trim() ? { targetLoreEntryId: targetId.trim() } : {}),
      title: title.trim(),
    };
  }

  async function saveDraft() {
    setError(null);

    if (!accessToken) {
      setError('Please sign in before saving a contribution.');
      return null;
    }

    setIsSaving(true);

    try {
      const payload = buildPayload();
      const response = draft
        ? await updateContribution(worldId, draft.id, payload, accessToken)
        : await createContribution(worldId, payload, accessToken);

      setDraft(response.contribution);
      return response.contribution;
    } catch (nextError) {
      setError(getErrorMessage(nextError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveDraft();
  }

  async function handleSubmitForVote() {
    setError(null);

    if (!accessToken) {
      setError('Please sign in before submitting a contribution.');
      return;
    }

    setIsSubmitting(true);

    try {
      const currentDraft = draft ?? (await saveDraft());

      if (!currentDraft) {
        return;
      }

      const response = await submitContribution(worldId, currentDraft.id, accessToken);
      setDraft(response.contribution);

      if (response.proposal?.id) {
        router.push(`/worlds/${worldId}/proposals/${response.proposal.id}`);
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSave}>
      {error ? (
        <Alert variant="danger">
          <AlertTitle>Contribution was not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {draft?.status === 'SUBMITTED' ? (
        <Alert variant="success">
          <AlertTitle>Proposal submitted</AlertTitle>
          <AlertDescription>
            This contribution is locked as a proposal and ready for the voting flow.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Draft contribution</CardTitle>
            <CardDescription>
              Structured content tied to this world before it enters canon voting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Title
                <Input
                  disabled={draft?.status === 'SUBMITTED'}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="A treaty breaks beneath the old gate"
                  required
                  value={title}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Contribution type
                <Select
                  disabled={draft?.status === 'SUBMITTED'}
                  onChange={(event) => setKind(event.target.value as ContributionKind)}
                  value={kind}
                >
                  <option value="LORE">Lore update</option>
                  <option value="STORY">Story contribution</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Target lore entry ID
                <Input
                  disabled={draft?.status === 'SUBMITTED'}
                  onChange={(event) => setTargetId(event.target.value)}
                  placeholder="Optional existing entry ID"
                  value={targetId}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Summary
                <Textarea
                  disabled={draft?.status === 'SUBMITTED'}
                  maxLength={1000}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="What should reviewers understand before voting?"
                  rows={3}
                  value={summary}
                />
              </label>
              <div className="md:col-span-2">
                <RichTextEditor
                  disabled={draft?.status === 'SUBMITTED'}
                  label="Contribution body"
                  onJsonChange={setContent}
                  placeholder="Write the contribution that reviewers will vote on..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Canon path</CardTitle>
              <CardDescription>Drafts become proposals when submitted.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-semibold">Status</dt>
                  <dd className="mt-2">
                    <Badge variant={draft?.status === 'SUBMITTED' ? 'proposal' : 'neutral'}>
                      {draft?.status ?? 'Unsaved draft'}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">World</dt>
                  <dd className="mt-1 text-muted-foreground">{worldId}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Author</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {user ? `@${user.hiveUsername}` : 'Sign in required'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Alert variant="warning">
            <AlertTitle>Before submitting</AlertTitle>
            <AlertDescription>
              Submitted drafts cannot be edited through the draft endpoints.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!canSave || draft?.status === 'SUBMITTED'}
              isLoading={isSaving && !isSubmitting}
              type="submit"
              variant="outline"
            >
              Save Draft
            </Button>
            <Button
              disabled={!canSubmit || draft?.status === 'SUBMITTED'}
              isLoading={isSubmitting}
              onClick={handleSubmitForVote}
              type="button"
              variant="hive"
            >
              Submit Proposal
            </Button>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-control border border-transparent bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              href={`/worlds/${worldId}`}
            >
              Back to World
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
