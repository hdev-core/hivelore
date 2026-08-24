import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ProposalDecisionOutcome, VoteChoice } from '../generated/prisma/enums.js';
import {
  addVotingWindow,
  CANON_VOTING_RULES,
  decideCanonOutcome,
  getVotingWindowState,
  hashCanonicalJson,
  tallyCanonVotes,
} from './canon-voting-policy.js';

const startedAt = new Date('2026-08-10T00:00:00.000Z');
const votingEndsAt = addVotingWindow(startedAt);
const afterEnd = new Date(votingEndsAt.getTime() + 1);

function votes(...choices: VoteChoice[]) {
  return choices.map((choice) => ({ choice }));
}

function voterVotes(...entries: Array<[string, VoteChoice]>) {
  return entries.map(([voterId, choice]) => ({ choice, voterId }));
}

describe('canon voting policy', () => {
  test('uses a 48 hour voting window and does not decide before the end', () => {
    assert.equal(votingEndsAt.toISOString(), '2026-08-12T00:00:00.000Z');
    assert.equal(
      getVotingWindowState({
        now: new Date(votingEndsAt.getTime() - 1),
        votingEndsAt,
      }),
      'BEFORE_END',
    );
    assert.equal(getVotingWindowState({ now: votingEndsAt, votingEndsAt }), 'AT_OR_AFTER_END');
    assert.equal(
      decideCanonOutcome({
        now: new Date(votingEndsAt.getTime() - 1),
        tally: tallyCanonVotes(votes(VoteChoice.APPROVE, VoteChoice.APPROVE)),
        votingEndsAt,
      }),
      null,
    );
  });

  test('exactly five votes and exactly 70 percent approval passes at the window boundary', () => {
    const tally = tallyCanonVotes(
      votes(
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.APPROVE,
        VoteChoice.REJECT,
        VoteChoice.REJECT,
        VoteChoice.REJECT,
      ),
    );

    assert.equal(tally.totalVotes, 10);
    assert.equal(tally.approvalPercentageBps, CANON_VOTING_RULES.approvalThresholdBps);
    assert.equal(
      decideCanonOutcome({ now: votingEndsAt, tally, votingEndsAt }),
      ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
    );
  });

  test('fewer than five votes fails even at 100 percent approval', () => {
    const tally = tallyCanonVotes(
      votes(VoteChoice.APPROVE, VoteChoice.APPROVE, VoteChoice.APPROVE, VoteChoice.APPROVE),
    );

    assert.equal(tally.approvalPercentageBps, 10_000);
    assert.equal(
      decideCanonOutcome({ now: afterEnd, tally, votingEndsAt }),
      ProposalDecisionOutcome.REJECTED,
    );
  });

  test('zero approve produces zero percent instead of NaN', () => {
    const tally = tallyCanonVotes(
      votes(VoteChoice.NEEDS_REVISION, VoteChoice.NEEDS_REVISION, VoteChoice.ALTERNATE_TIMELINE),
    );

    assert.equal(tally.totalVotes, 3);
    assert.equal(tally.approvalDenominator, 3);
    assert.equal(tally.approvalPercentageBps, 0);
    assert.equal(
      decideCanonOutcome({ now: afterEnd, tally, votingEndsAt }),
      ProposalDecisionOutcome.NEEDS_REVISION,
    );
  });

  test('revision and alternate votes count toward participation and approval denominator', () => {
    const tally = tallyCanonVotes(
      votes(
        VoteChoice.APPROVE,
        VoteChoice.REJECT,
        VoteChoice.NEEDS_REVISION,
        VoteChoice.ALTERNATE_TIMELINE,
        VoteChoice.ALTERNATE_TIMELINE,
      ),
    );

    assert.equal(tally.totalVotes, 5);
    assert.equal(tally.approvalDenominator, 5);
    assert.equal(tally.approvalNumerator, 1);
    assert.equal(tally.approvalPercentageBps, 2_000);
  });

  test('constructive dissent prevents approval instead of disappearing from the denominator', () => {
    const tally = tallyCanonVotes(
      votes(
        VoteChoice.APPROVE,
        VoteChoice.NEEDS_REVISION,
        VoteChoice.NEEDS_REVISION,
        VoteChoice.NEEDS_REVISION,
        VoteChoice.NEEDS_REVISION,
      ),
    );

    assert.equal(tally.totalVotes, 5);
    assert.equal(tally.approvalDenominator, 5);
    assert.equal(tally.approvalPercentageBps, 2_000);
    assert.equal(
      decideCanonOutcome({ now: afterEnd, tally, votingEndsAt }),
      ProposalDecisionOutcome.NEEDS_REVISION,
    );
  });

  test('uses deterministic failed-outcome plurality with stable tie order', () => {
    assert.equal(
      decideCanonOutcome({
        now: afterEnd,
        tally: tallyCanonVotes(
          votes(VoteChoice.NEEDS_REVISION, VoteChoice.ALTERNATE_TIMELINE, VoteChoice.REJECT),
        ),
        votingEndsAt,
      }),
      ProposalDecisionOutcome.NEEDS_REVISION,
    );

    assert.equal(
      decideCanonOutcome({
        now: afterEnd,
        tally: tallyCanonVotes(
          votes(VoteChoice.ALTERNATE_TIMELINE, VoteChoice.ALTERNATE_TIMELINE, VoteChoice.REJECT),
        ),
        votingEndsAt,
      }),
      ProposalDecisionOutcome.ALTERNATE_TIMELINE,
    );
  });

  test('stale base canon conflict is surfaced before applying a normal outcome', () => {
    assert.equal(
      decideCanonOutcome({
        now: afterEnd,
        staleBaseAtDecision: true,
        tally: tallyCanonVotes(
          votes(
            VoteChoice.APPROVE,
            VoteChoice.APPROVE,
            VoteChoice.APPROVE,
            VoteChoice.APPROVE,
            VoteChoice.APPROVE,
          ),
        ),
        votingEndsAt,
      }),
      ProposalDecisionOutcome.STALE_BASE_CONFLICT,
    );
  });

  test('canonical json hashing is deterministic across object key order', () => {
    assert.equal(hashCanonicalJson({ b: 2, a: 1 }), hashCanonicalJson({ a: 1, b: 2 }));
  });

  test('excludes proposal author votes from approval math and participation', () => {
    const tally = tallyCanonVotes(
      voterVotes(
        ['author-1', VoteChoice.APPROVE],
        ['reader-1', VoteChoice.APPROVE],
        ['reader-2', VoteChoice.APPROVE],
        ['reader-3', VoteChoice.APPROVE],
        ['reader-4', VoteChoice.REJECT],
        ['reader-5', VoteChoice.REJECT],
      ),
      { excludeVoterIds: new Set(['author-1']) },
    );

    assert.equal(tally.totalVotes, 5);
    assert.equal(tally.approve, 3);
    assert.equal(tally.reject, 2);
    assert.equal(tally.approvalPercentageBps, 6_000);
  });

  test('legacy author votes cannot satisfy the five-vote minimum', () => {
    const tally = tallyCanonVotes(
      voterVotes(
        ['author-1', VoteChoice.APPROVE],
        ['reader-1', VoteChoice.APPROVE],
        ['reader-2', VoteChoice.APPROVE],
        ['reader-3', VoteChoice.APPROVE],
        ['reader-4', VoteChoice.APPROVE],
      ),
      { excludeVoterIds: new Set(['author-1']) },
    );

    assert.equal(tally.totalVotes, 4);
    assert.equal(
      decideCanonOutcome({ now: afterEnd, tally, votingEndsAt }),
      ProposalDecisionOutcome.REJECTED,
    );
  });
});
