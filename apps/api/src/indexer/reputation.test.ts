import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  calculateReputation,
  emptyReputationSignals,
  REPUTATION_CALCULATION_VERSION,
} from './reputation.js';

describe('reputation calculator', () => {
  test('uses the product scoring constants for deterministic snapshots', () => {
    const result = calculateReputation({
      ...emptyReputationSignals(),
      canonizedContributions: 2,
      approvedProposals: 1,
      highApprovalRatioProposals: 1,
      repeatedRejectedSpamEvents: 1,
      resolvedReports: 3,
      helpfulComments: 4,
      voteBrigadingOrSpamEvents: 1,
    });

    assert.equal(result.score, 63);
    assert.equal(result.breakdown.calculationVersion, REPUTATION_CALCULATION_VERSION);
    assert.deepEqual(result.breakdown.components, {
      canonizedContributions: 50,
      approvedProposals: 10,
      highApprovalRatioProposals: 5,
      repeatedRejectedSpamEvents: -10,
      worldsReachingTenCanonEntries: 0,
      highContributorRetentionWorlds: 0,
      clearWorldBibles: 0,
      resolvedReports: 15,
      helpfulAcceptedReviews: 0,
      abusiveModerationEvents: 0,
      helpfulComments: 8,
      accurateFlags: 0,
      voteBrigadingOrSpamEvents: -15,
    });
  });
});
