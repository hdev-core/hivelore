import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AIReportStatus, LoreStatus } from '../generated/prisma/enums.js';
import { flattenSearchText } from './search-index.js';

export class ProposalConsistencyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ProposalConsistencyDatabase = Pick<
  PrismaClient,
  '$transaction' | 'aIReport' | 'loreEntry' | 'proposal' | 'worldBibleVersion'
>;

const NEGATION_PATTERNS = [
  /\b(?:no|not|never|cannot|can't|wont|won't|without)\b\s+(?:be\s+|have\s+|has\s+|is\s+|are\s+)?([a-z][a-z0-9 -]{2,80})/gi,
  /\b([a-z][a-z0-9 -]{2,80})\s+(?:is|are|was|were|has|have)\s+(?:no|not|never)\b/gi,
];

function normalizeFragment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectNegatedClaims(text: string) {
  const claims = new Set<string>();

  for (const pattern of NEGATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const claim = normalizeFragment(match[1] ?? '');

      if (claim.length >= 3) {
        claims.add(claim);
      }
    }
  }

  return claims;
}

function detectContradictions(input: { canonText: string; proposedText: string }) {
  const canonText = normalizeFragment(input.canonText);
  const proposedText = normalizeFragment(input.proposedText);
  const canonNegations = collectNegatedClaims(canonText);
  const proposedNegations = collectNegatedClaims(proposedText);
  const findings: Array<Record<string, string>> = [];

  for (const claim of canonNegations) {
    if (proposedText.includes(claim) && !proposedNegations.has(claim)) {
      findings.push({
        category: 'canon_consistency',
        evidence: claim,
        severity: 'high',
        summary: `Proposed content appears to assert "${claim}" even though existing canon negates it.`,
      });
    }
  }

  for (const claim of proposedNegations) {
    if (canonText.includes(claim) && !canonNegations.has(claim)) {
      findings.push({
        category: 'canon_consistency',
        evidence: claim,
        severity: 'high',
        summary: `Proposed content appears to negate "${claim}" even though existing canon asserts it.`,
      });
    }
  }

  return findings;
}

export async function runProposalConsistencyCheck(
  database: ProposalConsistencyDatabase,
  input: { proposalId: string; worldId: string },
) {
  return database.$transaction(async (transaction) => {
    const proposal = await transaction.proposal.findFirst({
      select: {
        id: true,
        proposedContent: true,
        title: true,
        worldId: true,
      },
      where: {
        id: input.proposalId,
        worldId: input.worldId,
      },
    });

    if (!proposal) {
      throw new ProposalConsistencyError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
    }

    const [currentBible, canonEntries] = await Promise.all([
      transaction.worldBibleVersion.findFirst({
        orderBy: {
          versionNumber: 'desc',
        },
        select: {
          content: true,
          id: true,
          versionNumber: true,
        },
        where: {
          worldId: input.worldId,
        },
      }),
      transaction.loreEntry.findMany({
        select: {
          content: true,
          id: true,
          title: true,
        },
        take: 50,
        where: {
          status: LoreStatus.PUBLISHED_CANON,
          worldId: input.worldId,
        },
      }),
    ]);

    const proposedText = [proposal.title, flattenSearchText(proposal.proposedContent)].join(' ');
    const canonText = [
      flattenSearchText(currentBible?.content),
      ...canonEntries.map((entry) => `${entry.title} ${flattenSearchText(entry.content)}`),
    ].join(' ');
    const findings = detectContradictions({
      canonText,
      proposedText,
    });
    const hasWarning = findings.length > 0;
    const report = await transaction.aIReport.create({
      data: {
        findings: {
          checkedCanonEntries: canonEntries.length,
          currentBibleVersionId: currentBible?.id ?? null,
          currentBibleVersionNumber: currentBible?.versionNumber ?? null,
          findings,
        } satisfies Prisma.InputJsonObject,
        model: 'deterministic-canon-consistency-v1',
        proposalId: proposal.id,
        provider: 'hivelore',
        status: AIReportStatus.COMPLETED,
        summary: hasWarning
          ? `${findings.length} possible canon consistency conflict${findings.length === 1 ? '' : 's'} found.`
          : 'No major canon consistency conflicts found.',
      },
    });

    return {
      aiReport: {
        findings: report.findings,
        id: report.id,
        model: report.model,
        provider: report.provider,
        status: report.status,
        summary: report.summary,
      },
      warningCount: findings.length,
    };
  });
}
