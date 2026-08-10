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
  listContributions,
  submitContribution,
  updateContribution,
  type Contribution,
  type ContributionKind,
} from '@/lib/api/contributions';
import { useAuthSession } from '@/providers/auth-session-provider';

const STRUCTURED_DOCUMENT_MAX_BYTES = 100 * 1024;

const emptyDocument: StructuredEditorContent = {
  type: 'doc',
  content: [],
};

type ContributionEditorFormProps = {
  initialKind: ContributionKind;
  targetLoreEntryId?: string;
  unsupportedType?: string;
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

function getStructuredDocumentBytes(content: StructuredEditorContent) {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}

export function ContributionEditorForm({
  initialKind,
  targetLoreEntryId,
  unsupportedType,
  worldId,
}: ContributionEditorFormProps) {
  const router = useRouter();
  const { accessToken, isSessionLoading, user } = useAuthSession();
  const [content, setContent] = useState<StructuredEditorContent>(emptyDocument);
  const [draft, setDraft] = useState<Contribution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ContributionKind>(initialKind);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'allowed' | 'denied'>(
    'checking',
  );
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

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!accessToken) {
      setPermissionStatus('denied');
      return;
    }

    const controller = new AbortController();

    setPermissionStatus('checking');
    setError(null);

    listContributions(worldId, { page: 1, pageSize: 1 }, accessToken)
      .then(() => {
        if (!controller.signal.aborted) {
          setPermissionStatus('allowed');
        }
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPermissionStatus('denied');
        setError(
          nextError instanceof ApiError && nextError.status === 403
            ? 'You do not have permission to draft contributions in this world.'
            : getErrorMessage(nextError),
        );
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, isSessionLoading, worldId]);

  const contentBytes = getStructuredDocumentBytes(content);
  const isContentTooLarge = contentBytes > STRUCTURED_DOCUMENT_MAX_BYTES;
  const contentKilobytes = Math.ceil(contentBytes / 1024);
  const contentLimitKilobytes = STRUCTURED_DOCUMENT_MAX_BYTES / 1024;

  const canSave = useMemo(
    () =>
      Boolean(
        accessToken &&
        permissionStatus === 'allowed' &&
        title.trim() &&
        hasMeaningfulText(content) &&
        !isContentTooLarge &&
        !isSaving &&
        !isSubmitting,
      ),
    [accessToken, content, isContentTooLarge, isSaving, isSubmitting, permissionStatus, title],
  );

  const canSubmit = canSave && !isSubmitting;

  function buildPayload() {
    const trimmedSummary = summary.trim();
    const trimmedTargetId = targetId.trim();

    return {
      content,
      kind,
      ...(trimmedSummary ? { summary: trimmedSummary } : draft ? { summary: null } : {}),
      ...(trimmedTargetId
        ? { targetLoreEntryId: trimmedTargetId }
        : draft
          ? { targetLoreEntryId: null }
          : {}),
      title: title.trim(),
    };
  }

  async function saveDraft() {
    setError(null);

    if (!accessToken) {
      setError('Please sign in before saving a contribution.');
      return null;
    }

    if (permissionStatus !== 'allowed') {
      setError('You do not have permission to draft contributions in this world.');
      return null;
    }

    if (isContentTooLarge) {
      setError(`Contribution body must stay under ${contentLimitKilobytes} KB.`);
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

    if (isSubmitting) {
      return;
    }

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
      const currentDraft = await saveDraft();

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
      {permissionStatus === 'checking' ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Checking contribution access...</p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="danger">
          <AlertTitle>Contribution was not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {unsupportedType ? (
        <Alert variant="warning">
          <AlertTitle>Contribution type not supported yet</AlertTitle>
          <AlertDescription>
            The contribution API currently supports lore updates and stories. This draft will be
            saved as a lore update until typed contribution categories are added.
          </AlertDescription>
        </Alert>
      ) : null}

      {permissionStatus === 'denied' ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                href={`/worlds/${worldId}`}
              >
                Back to World
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {permissionStatus !== 'allowed' ? null : (
        <>
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
                    <p
                      className={
                        isContentTooLarge
                          ? 'mt-2 text-sm font-semibold text-danger'
                          : 'mt-2 text-sm text-muted-foreground'
                      }
                    >
                      {contentKilobytes} KB of {contentLimitKilobytes} KB
                    </p>
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
                  Submitted drafts are locked once they enter proposal review.
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
        </>
      )}
    </form>
  );
}
