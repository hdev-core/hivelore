import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AIReportStatus } from '../generated/prisma/enums.js';
import { runProposalConsistencyCheck } from './proposal-consistency.js';

function createDatabase() {
  const reports: unknown[] = [];
  const proposal = {
    id: 'proposal-1',
    proposedContent: {
      body: 'The moon gate is open.',
    },
    title: 'Moon Gate Reopens',
    worldId: 'world-1',
  };
  const bibleVersion = {
    content: {
      rule: 'The moon gate is not open.',
    },
    id: 'bible-1',
    versionNumber: 2,
  };
  const loreEntries = [
    {
      content: {
        body: 'A published canon note.',
      },
      id: 'lore-1',
      title: 'Canon Note',
    },
  ];
  const database = {
    aIReport: {
      async create(args: { data: Record<string, unknown> }) {
        const report = {
          createdAt: new Date('2026-09-02T12:00:00.000Z'),
          errorCode: null,
          errorMessage: null,
          id: `report-${reports.length + 1}`,
          updatedAt: new Date('2026-09-02T12:00:00.000Z'),
          ...args.data,
        };
        reports.push(report);
        return report;
      },
    },
    loreEntry: {
      async findMany() {
        return loreEntries;
      },
    },
    proposal: {
      async findFirst(args: { where: { id: string; worldId: string } }) {
        if (args.where.id !== proposal.id || args.where.worldId !== proposal.worldId) {
          return null;
        }

        return proposal;
      },
    },
    worldBibleVersion: {
      async findFirst() {
        return bibleVersion;
      },
    },
    $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
  };

  return {
    database,
    reports,
  };
}

describe('proposal consistency checks', () => {
  test('creates a completed AI report with a visible major warning when proposed canon conflicts', async () => {
    const state = createDatabase();

    const result = await runProposalConsistencyCheck(state.database as never, {
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });

    assert.equal(result.warningCount, 1);
    assert.equal(result.aiReport.status, AIReportStatus.COMPLETED);
    assert.equal(result.aiReport.provider, 'hivelore');
    assert.equal(
      (
        (state.reports[0] as { findings: { findings: Array<{ severity: string }> } }).findings
          .findings[0] as { severity: string }
      ).severity,
      'high',
    );
  });

  test('stores a no-warning report when the proposal does not contradict canon', async () => {
    const state = createDatabase();
    (state.database.proposal.findFirst as unknown as () => Promise<unknown>) = async () => ({
      id: 'proposal-1',
      proposedContent: {
        body: 'The archive remains closed.',
      },
      title: 'Archive Remains Closed',
      worldId: 'world-1',
    });

    const result = await runProposalConsistencyCheck(state.database as never, {
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });

    assert.equal(result.warningCount, 0);
    assert.equal(result.aiReport.summary, 'No major canon consistency conflicts found.');
  });
});
