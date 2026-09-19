import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ChangeEvent, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import type { Contribution, Proposal } from '@/lib/api/contributions';
import { ContributionEditorForm } from './contribution-editor-form';

const mocks = vi.hoisted(() => ({
  authSession: vi.fn(),
  createContribution: vi.fn(),
  listContributions: vi.fn(),
  push: vi.fn(),
  submitContribution: vi.fn(),
  updateContribution: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/providers/auth-session-provider', () => ({
  useAuthSession: () => mocks.authSession(),
}));

vi.mock('@/lib/api/contributions', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/contributions')>('@/lib/api/contributions');

  return {
    ...actual,
    createContribution: mocks.createContribution,
    listContributions: mocks.listContributions,
    submitContribution: mocks.submitContribution,
    updateContribution: mocks.updateContribution,
  };
});

vi.mock('@/components/editor/rich-text-editor', () => ({
  RichTextEditor: ({
    disabled,
    label,
    onJsonChange,
    placeholder,
  }: {
    disabled?: boolean;
    label?: string;
    onJsonChange?: (content: Record<string, unknown>) => void;
    placeholder?: string;
  }) =>
    createElement(
      'label',
      null,
      label,
      createElement('textarea', {
        'aria-label': label,
        disabled,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
          onJsonChange?.({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: event.currentTarget.value }],
              },
            ],
          }),
        placeholder,
      }),
    ),
}));

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    authorId: 'user-1',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft body' }] }],
    },
    createdAt: '2026-08-30T20:00:00.000Z',
    id: 'draft-1',
    kind: 'LORE',
    proposal: null,
    proposalId: null,
    status: 'DRAFT',
    submittedAt: null,
    summary: null,
    targetLoreEntry: null,
    targetLoreEntryId: null,
    title: 'Draft title',
    updatedAt: '2026-08-30T20:00:00.000Z',
    worldId: 'world-1',
    ...overrides,
  };
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal-1',
    proposalType: 'ADD_LORE',
    status: 'VOTING',
    submittedAt: '2026-08-30T20:01:00.000Z',
    title: 'Updated version',
    worldId: 'world-1',
    ...overrides,
  };
}

function apiError(status: number, error: string) {
  return new ApiError({
    body: { error },
    status,
    statusText: error,
  });
}

function renderEditor(props: Partial<ComponentProps<typeof ContributionEditorForm>> = {}) {
  return render(
    createElement(ContributionEditorForm, {
      initialKind: 'LORE',
      worldId: 'world-1',
      ...props,
    }),
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();

  renderEditor();

  await screen.findByRole('button', { name: 'Save Draft' });
  await user.type(screen.getByLabelText('Title'), 'A better ending');
  await user.type(screen.getByLabelText('Contribution body'), 'The gate opens at dawn.');

  return user;
}

describe('ContributionEditorForm', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.listContributions.mockReset();
    mocks.createContribution.mockReset();
    mocks.updateContribution.mockReset();
    mocks.submitContribution.mockReset();
    mocks.authSession.mockReset();
    mocks.authSession.mockReturnValue({
      accessToken: 'access-token-1',
      isSessionLoading: false,
      refreshSession: vi.fn(),
      user: { hiveUsername: 'kareem' },
    });
    mocks.listContributions.mockResolvedValue({
      contributions: [],
      pagination: { page: 1, pageSize: 1, total: 0 },
    });
  });

  it('saves a draft with the current structured content', async () => {
    mocks.createContribution.mockResolvedValue({ contribution: contribution() });

    const user = await fillRequiredFields();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(mocks.createContribution).toHaveBeenCalledOnce());
    expect(mocks.createContribution).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The gate opens at dawn.' }],
            },
          ],
        },
        kind: 'LORE',
        title: 'A better ending',
      }),
      'access-token-1',
    );
  });

  it('refreshes the token after a 401 mid-save and retries with the rotated token', async () => {
    const refreshSession = vi.fn().mockResolvedValue({
      accessToken: 'access-token-2',
      user: { hiveUsername: 'kareem' },
    });

    mocks.authSession.mockReturnValue({
      accessToken: 'access-token-1',
      isSessionLoading: false,
      refreshSession,
      user: { hiveUsername: 'kareem' },
    });
    mocks.createContribution
      .mockRejectedValueOnce(apiError(401, 'token expired'))
      .mockResolvedValueOnce({ contribution: contribution() });

    const user = await fillRequiredFields();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(mocks.createContribution).toHaveBeenCalledTimes(2));
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(mocks.createContribution).toHaveBeenNthCalledWith(
      2,
      'world-1',
      expect.any(Object),
      'access-token-2',
    );
  });

  it('hides the editor when the permission preflight returns 403', async () => {
    mocks.listContributions.mockRejectedValue(apiError(403, 'forbidden'));

    renderEditor();

    expect(
      await screen.findByText('You do not have permission to draft contributions in this world.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
  });

  it('submits the latest unsaved edits before creating the proposal', async () => {
    mocks.createContribution.mockResolvedValueOnce({
      contribution: contribution({ id: 'draft-1', title: 'Initial version' }),
    });
    mocks.updateContribution.mockResolvedValueOnce({
      contribution: contribution({ id: 'draft-1', title: 'Updated version' }),
    });
    mocks.submitContribution.mockResolvedValueOnce({
      alreadySubmitted: false,
      contribution: contribution({ id: 'draft-1', status: 'SUBMITTED' }),
      proposal: proposal(),
    });

    const user = await fillRequiredFields();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(mocks.createContribution).toHaveBeenCalledOnce());
    const titleField = screen.getByLabelText('Title');
    await user.clear(titleField);
    await user.type(titleField, 'Updated version');
    await user.click(screen.getByRole('button', { name: 'Submit Proposal' }));

    await waitFor(() => expect(mocks.updateContribution).toHaveBeenCalledOnce());
    expect(mocks.updateContribution).toHaveBeenCalledWith(
      'world-1',
      'draft-1',
      expect.objectContaining({ title: 'Updated version' }),
      'access-token-1',
    );
    expect(mocks.submitContribution).toHaveBeenCalledWith('world-1', 'draft-1', 'access-token-1');
    expect(mocks.push).toHaveBeenCalledWith('/worlds/world-1/proposals/proposal-1');
  });
});
