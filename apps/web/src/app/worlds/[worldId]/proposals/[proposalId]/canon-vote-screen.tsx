'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/states/loading-state';
import { Textarea } from '@/components/ui/textarea';
import {
  castProposalVote,
  confirmCanonTransaction,
  createProposalComment,
  createCanonTransaction,
  finalizeProposal,
  getProposal,
  getProposalComments,
  PROPOSAL_COMMENT_MAX_LENGTH,
  type ProposalCommentsResponse,
  type ProposalDetail,
  type VoteChoice,
} from '@/lib/api/proposals';
import { refreshAuthSession, type SafeUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { requestCanonDecisionSignature } from '@/lib/hive/canon-signing';

const voteLabels: Record<VoteChoice, string> = {
  APPROVE: 'Approve',
  ALTERNATE_TIMELINE: 'Alternate Timeline',
  NEEDS_REVISION: 'Needs Revision',
  REJECT: 'Reject',
};

const voteHelp: Record<VoteChoice, string> = {
  APPROVE: 'Counts for canon approval.',
  ALTERNATE_TIMELINE: 'Counts for participation, not approval percentage.',
  NEEDS_REVISION: 'Counts for participation, not approval percentage.',
  REJECT: 'Counts against canon approval.',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.body?.error ?? 'Request failed.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed.';
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not scheduled';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCountdown(value: string | null) {
  if (!value) {
    return 'Voting window missing';
  }

  const remaining = new Date(value).getTime() - Date.now();

  if (remaining <= 0) {
    return 'Voting ended';
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  return `${hours}h ${minutes}m remaining`;
}

function statusVariant(status: string) {
  if (status === 'APPROVED_FOR_PUBLICATION') {
    return 'ready-to-publish' as const;
  }

  if (status === 'REJECTED') {
    return 'rejected' as const;
  }

  if (status === 'ALTERNATE_TIMELINE') {
    return 'alternate-timeline' as const;
  }

  if (status === 'PUBLISHED') {
    return 'published-on-hive' as const;
  }

  return 'proposal' as const;
}

function contentText(value: unknown) {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }

  const text: string[] = [];
  const pending = [value];

  while (pending.length > 0) {
    const item = pending.pop();

    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;

    if (typeof record.text === 'string') {
      text.push(record.text);
    }

    if (Array.isArray(record.content)) {
      pending.push(...record.content);
    }
  }

  return text.join(' ').trim() || JSON.stringify(value, null, 2);
}

function ResultPanel({ proposal }: { proposal: ProposalDetail }) {
  const decision = proposal.decision;

  if (!decision && proposal.status === 'VOTING' && proposal.votingEndsAt) {
    const ended = Date.now() >= new Date(proposal.votingEndsAt).getTime();

    return (
      <Alert variant={ended ? 'warning' : 'info'}>
        <AlertTitle>{ended ? 'Awaiting finalization' : 'Voting open'}</AlertTitle>
        <AlertDescription>
          {ended
            ? 'The 48-hour voting window has ended. A curator can finalize the frozen result.'
            : 'Votes can be changed until the deadline. No result is final before then.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!decision) {
    return (
      <Alert>
        <AlertTitle>No decision yet</AlertTitle>
        <AlertDescription>
          This proposal has not entered a terminal governance state.
        </AlertDescription>
      </Alert>
    );
  }

  const confirmed = Boolean(decision.hiveEventId);
  const approved = decision.outcome === 'APPROVED_FOR_PUBLICATION';

  return (
    <Alert variant={confirmed ? 'success' : approved ? 'warning' : 'info'}>
      <AlertTitle>
        {confirmed
          ? 'Canon decision confirmed on Hive'
          : approved
            ? 'Awaiting Hive signature'
            : decision.outcome.replaceAll('_', ' ')}
      </AlertTitle>
      <AlertDescription>
        {confirmed
          ? `Verified transaction ${decision.transactionId}.`
          : approved
            ? 'This is approved for publication, not published canon. The author still signs a Hive custom_json decision.'
            : 'This proposal did not become approved-for-publication under the MVP voting policy.'}
      </AlertDescription>
    </Alert>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{label}</span>
        <span>{safeValue.toFixed(0)}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-control bg-muted" role="progressbar">
        <div className="h-full bg-success" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs >= 0 && diffMs < minute) {
    return 'Just now';
  }

  if (diffMs >= 0 && diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }

  if (diffMs >= 0 && diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function CanonVoteScreen({ proposalId, worldId }: { proposalId: string; worldId: string }) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [receipt, setReceipt] = useState({
    blockNumber: '',
    operationIndex: '',
    transactionId: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');

  useEffect(() => {
    let mounted = true;

    refreshAuthSession()
      .then((session) => {
        if (!mounted) {
          return;
        }

        setAccessToken(session.accessToken);
        setCurrentUser(session.user);
      })
      .catch(() => {
        if (mounted) {
          setAccessToken(null);
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setSessionChecked(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const proposalQuery = useQuery({
    queryFn: () => getProposal(worldId, proposalId, accessToken ?? undefined),
    queryKey: ['proposal', worldId, proposalId, accessToken],
  });

  const commentsQuery = useInfiniteQuery<
    ProposalCommentsResponse,
    Error,
    InfiniteData<ProposalCommentsResponse, string | null>,
    [string, string, string],
    string | null
  >({
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getProposalComments({
        cursor: pageParam,
        pageSize: 20,
        proposalId,
        worldId,
      }),
    queryKey: ['proposal-comments', worldId, proposalId],
  });

  const proposal = proposalQuery.data?.proposal;
  const invalidateProposal = () =>
    queryClient.invalidateQueries({ queryKey: ['proposal', worldId, proposalId] });
  const invalidateComments = () =>
    queryClient.invalidateQueries({ queryKey: ['proposal-comments', worldId, proposalId] });

  const voteMutation = useMutation({
    mutationFn: (choice: VoteChoice) =>
      castProposalVote({ accessToken: accessToken ?? '', choice, proposalId, worldId }),
    onSuccess: () => {
      setMessage('Vote saved.');
      void invalidateProposal();
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeProposal({ accessToken: accessToken ?? '', proposalId, worldId }),
    onSuccess: () => {
      setMessage('Decision finalized from the frozen tally.');
      void invalidateProposal();
    },
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const operation = await createCanonTransaction({
        accessToken: accessToken ?? '',
        proposalId,
        worldId,
      });
      return requestCanonDecisionSignature(operation);
    },
    onSuccess: (nextReceipt) => {
      setMessage(
        nextReceipt.provider === 'manual'
          ? 'custom_json copied. Broadcast it with posting authority, then enter the confirmed operation details.'
          : 'Signature requested. Enter the confirmed Hive operation details after broadcast.',
      );

      if (nextReceipt.transactionId) {
        setReceipt((current) => ({ ...current, transactionId: nextReceipt.transactionId ?? '' }));
      }

      void invalidateProposal();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmCanonTransaction({
        accessToken: accessToken ?? '',
        blockNumber: Number(receipt.blockNumber),
        operationIndex: Number(receipt.operationIndex),
        proposalId,
        transactionId: receipt.transactionId,
        worldId,
      }),
    onSuccess: () => {
      setMessage('Hive operation verified and recorded.');
      void invalidateProposal();
    },
  });

  const trimmedCommentBody = commentBody.trim();
  const commentTooLong = commentBody.length > PROPOSAL_COMMENT_MAX_LENGTH;
  const commentValidationMessage = !trimmedCommentBody
    ? 'Write a comment before posting.'
    : commentTooLong
      ? `Comments can be ${PROPOSAL_COMMENT_MAX_LENGTH} characters or fewer.`
      : null;

  const commentMutation = useMutation({
    mutationFn: () =>
      createProposalComment({
        accessToken: accessToken ?? '',
        body: commentBody,
        proposalId,
        worldId,
      }),
    onSuccess: () => {
      setCommentBody('');
      setMessage('Comment posted.');
      void invalidateComments();
    },
  });

  const votingClosed = useMemo(() => {
    if (!proposal?.votingEndsAt) {
      return true;
    }

    return Date.now() >= new Date(proposal.votingEndsAt).getTime();
  }, [proposal?.votingEndsAt]);

  if (proposalQuery.isLoading || !sessionChecked) {
    return <LoadingState message="Loading canon vote" />;
  }

  if (proposalQuery.isError || !proposal) {
    return (
      <Alert variant="danger">
        <AlertTitle>Proposal unavailable</AlertTitle>
        <AlertDescription>{getErrorMessage(proposalQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const approvalProgress =
    proposal.tally.approvalDenominator > 0 ? proposal.tally.approvalPercentageBps / 100 : 0;
  const participationProgress = (proposal.tally.totalVotes / 5) * 100;
  const canVote = Boolean(accessToken) && proposal.status === 'VOTING' && !votingClosed;
  const canFinalize = Boolean(accessToken) && proposal.status === 'VOTING' && votingClosed;
  const canSign =
    Boolean(accessToken) &&
    proposal.decision?.outcome === 'APPROVED_FOR_PUBLICATION' &&
    !proposal.decision.hiveEventId &&
    currentUser?.id === proposal.author.id;
  const canConfirm =
    Boolean(accessToken) &&
    Boolean(receipt.transactionId.trim()) &&
    Number.isInteger(Number(receipt.blockNumber)) &&
    Number.isInteger(Number(receipt.operationIndex));

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(proposal.status)}>
            {proposal.status.replaceAll('_', ' ')}
          </Badge>
          {proposal.aiWarning.acknowledged ? (
            <Badge variant="ai-warning">Major AI warning</Badge>
          ) : null}
          {proposal.branchLabel ? (
            <Badge variant="alternate-timeline">{proposal.branchLabel}</Badge>
          ) : null}
        </div>
        <div className="grid gap-3">
          <p className="text-sm font-semibold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
            {proposal.world.title} / {proposal.proposalType.replaceAll('_', ' ')}
          </p>
          <h1 className="max-w-4xl text-3xl font-semibold tracking-normal sm:text-4xl">
            {proposal.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {proposal.summary || 'No summary provided.'}
          </p>
          <p className="text-sm text-muted-foreground">Author: @{proposal.author.hiveUsername}</p>
        </div>
      </section>

      <div aria-live="polite" className="sr-only">
        {message}
      </div>

      {message ? (
        <Alert>
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {voteMutation.error ||
      finalizeMutation.error ||
      signMutation.error ||
      confirmMutation.error ||
      commentMutation.error ? (
        <Alert variant="danger">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>
            {getErrorMessage(
              voteMutation.error ??
                finalizeMutation.error ??
                signMutation.error ??
                confirmMutation.error ??
                commentMutation.error,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="grid gap-5">
          <div className="grid gap-3 rounded-panel border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold tracking-normal">Proposal Content</h2>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {contentText(proposal.proposedContent)}
            </p>
          </div>

          <div className="grid gap-3 rounded-panel border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-normal">AI Report</h2>
              {proposal.aiWarning.acknowledged ? (
                <Badge variant="ai-warning">Warning preserved</Badge>
              ) : null}
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              {proposal.aiWarning.summary ??
                'No major AI warning is attached to this proposal decision.'}
            </p>
          </div>

          <div className="grid gap-3 rounded-panel border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold tracking-normal">Branch And Conflict State</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-muted-foreground">Base canon version</dt>
                <dd>{proposal.baseCanonVersionId ?? 'Current world base at submission'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-foreground">Branch base</dt>
                <dd>
                  {proposal.branchBaseLoreEntryId ??
                    proposal.branchParentProposalId ??
                    'Main continuity'}
                </dd>
              </div>
            </dl>
            {proposal.conflictMetadata ? (
              <pre className="overflow-auto rounded-control bg-muted p-3 text-xs">
                {JSON.stringify(proposal.conflictMetadata, null, 2)}
              </pre>
            ) : null}
          </div>

          <section className="grid gap-4 rounded-panel border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-normal">Discussion</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {commentsQuery.data?.pages[0]?.totalCount ?? 0} comments
                </p>
              </div>
              {commentsQuery.isError ? (
                <Button onClick={() => void commentsQuery.refetch()} variant="outline">
                  Retry
                </Button>
              ) : null}
            </div>

            {commentsQuery.isLoading ? (
              <div className="grid gap-3" aria-label="Loading comments">
                <div className="h-20 animate-pulse rounded-control bg-muted" />
                <div className="h-20 animate-pulse rounded-control bg-muted" />
              </div>
            ) : commentsQuery.isError ? (
              <Alert variant="danger">
                <AlertTitle>Comments unavailable</AlertTitle>
                <AlertDescription>{getErrorMessage(commentsQuery.error)}</AlertDescription>
              </Alert>
            ) : null}

            {commentsQuery.data &&
            commentsQuery.data.pages.every((page) => page.comments.length === 0) ? (
              <div className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground">
                No discussion yet.
              </div>
            ) : null}

            {commentsQuery.data ? (
              <div className="grid gap-3">
                {commentsQuery.data.pages.flatMap((page) =>
                  page.comments.map((comment) => (
                    <article
                      className="grid gap-2 rounded-control border border-border p-4"
                      key={comment.id}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">@{comment.author.hiveUsername}</span>
                        {comment.author.displayName ? (
                          <span className="text-muted-foreground">
                            {comment.author.displayName}
                          </span>
                        ) : null}
                        <time className="text-muted-foreground" dateTime={comment.createdAt}>
                          {formatCommentTime(comment.createdAt)}
                        </time>
                      </div>
                      {comment.isDeleted ? (
                        <p className="text-sm italic text-muted-foreground">
                          This comment was removed by moderation.
                        </p>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm leading-7">
                          {comment.body}
                        </p>
                      )}
                    </article>
                  )),
                )}
              </div>
            ) : null}

            {commentsQuery.hasNextPage ? (
              <Button
                disabled={commentsQuery.isFetchingNextPage}
                isLoading={commentsQuery.isFetchingNextPage}
                onClick={() => void commentsQuery.fetchNextPage()}
                variant="outline"
              >
                Load More
              </Button>
            ) : null}

            <form
              className="grid gap-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault();

                if (!accessToken || commentValidationMessage || commentMutation.isPending) {
                  return;
                }

                commentMutation.mutate();
              }}
            >
              <label className="text-sm font-semibold" htmlFor="proposal-comment-body">
                Add a comment
              </label>
              <Textarea
                aria-describedby="proposal-comment-help proposal-comment-error"
                disabled={!accessToken || commentMutation.isPending}
                id="proposal-comment-body"
                isInvalid={Boolean(commentValidationMessage && commentBody.length > 0)}
                maxLength={PROPOSAL_COMMENT_MAX_LENGTH + 1}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Share feedback or ask a question about this proposal."
                value={commentBody}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground" id="proposal-comment-help">
                  {commentBody.length}/{PROPOSAL_COMMENT_MAX_LENGTH}
                </p>
                <Button
                  disabled={
                    !accessToken || Boolean(commentValidationMessage) || commentMutation.isPending
                  }
                  isLoading={commentMutation.isPending}
                  type="submit"
                  variant="hive"
                >
                  Post Comment
                </Button>
              </div>
              <div aria-live="polite" className="text-sm text-danger" id="proposal-comment-error">
                {commentBody.length > 0 ? commentValidationMessage : null}
              </div>
              {!accessToken ? (
                <p className="text-sm text-muted-foreground">
                  Sign in as an eligible world member to comment.
                </p>
              ) : null}
            </form>
          </section>
        </section>

        <aside className="grid content-start gap-5">
          <ResultPanel proposal={proposal} />

          <div className="grid gap-4 rounded-panel border border-border bg-surface p-5">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Canon Vote</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                5 eligible votes, 70% approve versus approve plus reject, and a full 48 hours.
              </p>
            </div>

            <div className="grid gap-3">
              <ProgressBar label="Approval" value={approvalProgress} />
              <ProgressBar label="Participation" value={participationProgress} />
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(['APPROVE', 'REJECT', 'NEEDS_REVISION', 'ALTERNATE_TIMELINE'] as VoteChoice[]).map(
                (choice) => (
                  <div key={choice} className="rounded-control border border-border p-3">
                    <dt className="font-semibold">{voteLabels[choice]}</dt>
                    <dd className="text-2xl font-semibold">
                      {choice === 'APPROVE'
                        ? proposal.tally.approve
                        : choice === 'REJECT'
                          ? proposal.tally.reject
                          : choice === 'NEEDS_REVISION'
                            ? proposal.tally.needsRevision
                            : proposal.tally.alternateTimeline}
                    </dd>
                  </div>
                ),
              )}
            </dl>

            <div className="grid gap-2">
              <p className="text-sm font-semibold">
                Ends {formatDate(proposal.votingEndsAt)} / {formatCountdown(proposal.votingEndsAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                Current vote:{' '}
                {proposal.currentUserVote?.choice
                  ? voteLabels[proposal.currentUserVote.choice]
                  : 'None'}
              </p>
            </div>

            <div className="grid gap-2">
              {(['APPROVE', 'REJECT', 'NEEDS_REVISION', 'ALTERNATE_TIMELINE'] as VoteChoice[]).map(
                (choice) => (
                  <Button
                    key={choice}
                    aria-label={`${voteLabels[choice]}. ${voteHelp[choice]}`}
                    disabled={!canVote}
                    isLoading={voteMutation.isPending && voteMutation.variables === choice}
                    onClick={() => voteMutation.mutate(choice)}
                    variant={proposal.currentUserVote?.choice === choice ? 'hive' : 'outline'}
                  >
                    {voteLabels[choice]}
                  </Button>
                ),
              )}
            </div>

            {!accessToken ? (
              <p className="text-sm text-muted-foreground">
                Sign in to vote or complete governance actions.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-panel border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold tracking-normal">Governance Actions</h2>
            <Button
              disabled={!canFinalize}
              isLoading={finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate()}
              variant="secondary"
            >
              Finalize Frozen Result
            </Button>
            <Button
              disabled={!canSign}
              isLoading={signMutation.isPending}
              onClick={() => signMutation.mutate()}
              variant="hive"
            >
              Sign Hive Decision
            </Button>
            <div className="grid gap-2">
              <Input
                aria-label="Hive transaction id"
                onChange={(event) =>
                  setReceipt((current) => ({ ...current, transactionId: event.target.value }))
                }
                placeholder="Transaction ID"
                value={receipt.transactionId}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label="Hive block number"
                  inputMode="numeric"
                  onChange={(event) =>
                    setReceipt((current) => ({ ...current, blockNumber: event.target.value }))
                  }
                  placeholder="Block"
                  value={receipt.blockNumber}
                />
                <Input
                  aria-label="Hive operation index"
                  inputMode="numeric"
                  onChange={(event) =>
                    setReceipt((current) => ({ ...current, operationIndex: event.target.value }))
                  }
                  placeholder="Operation"
                  value={receipt.operationIndex}
                />
              </div>
              <Button
                disabled={!canConfirm}
                isLoading={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
                variant="outline"
              >
                Verify Hive Operation
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
