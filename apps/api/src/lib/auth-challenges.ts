import { AuthProvider } from '../generated/prisma/enums.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { sha256Hmac } from './auth-crypto.js';
import type { HiveAuthProvider } from './hive-signature.js';
import { normalizeHiveUsername } from './hive-username.js';

export type AuthChallengeDatabase = Pick<PrismaClient, 'authChallenge'>;

const providerToDatabase: Record<HiveAuthProvider, AuthProvider> = {
  hivesigner: AuthProvider.HIVESIGNER,
  keychain: AuthProvider.KEYCHAIN,
};

export class AuthChallengeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function toDatabaseAuthProvider(provider: HiveAuthProvider) {
  return providerToDatabase[provider];
}

export function buildAuthChallengeMessage(input: {
  audience: string;
  expiresAt: Date;
  issuedAt: Date;
  nonce: string;
  username: string;
}) {
  return [
    'HiveLore Authentication',
    '',
    `Username: ${input.username}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expires At: ${input.expiresAt.toISOString()}`,
    `Audience: ${input.audience}`,
    '',
    'Signing this message authenticates you to HiveLore.',
    'It does not authorize a Hive transaction or transfer.',
  ].join('\n');
}

export async function createAuthChallenge(
  database: AuthChallengeDatabase,
  input: {
    audience: string;
    hmacSecret: string;
    nonce: string;
    provider: HiveAuthProvider;
    ttlSeconds: number;
    username: string;
    now?: Date;
  },
) {
  const normalizedHiveUsername = normalizeHiveUsername(input.username);
  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + input.ttlSeconds * 1000);
  const message = buildAuthChallengeMessage({
    audience: input.audience,
    expiresAt,
    issuedAt,
    nonce: input.nonce,
    username: normalizedHiveUsername,
  });
  await database.authChallenge.deleteMany({
    where: {
      expiresAt: {
        lt: issuedAt,
      },
    },
  });

  const challenge = await database.authChallenge.create({
    data: {
      challengeHash: sha256Hmac(message, input.hmacSecret),
      expiresAt,
      issuedAt,
      nonceHash: sha256Hmac(input.nonce, input.hmacSecret),
      normalizedHiveUsername,
      provider: toDatabaseAuthProvider(input.provider),
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    message,
    username: normalizedHiveUsername,
  };
}

export async function consumeAuthChallenge(
  database: AuthChallengeDatabase,
  input: {
    challengeId: string;
    hmacSecret: string;
    message: string;
    provider: HiveAuthProvider;
    username: string;
    now?: Date;
  },
) {
  const normalizedHiveUsername = normalizeHiveUsername(input.username);
  const now = input.now ?? new Date();
  const challenge = await database.authChallenge.findUnique({
    where: {
      id: input.challengeId,
    },
    select: {
      challengeHash: true,
      consumedAt: true,
      expiresAt: true,
      normalizedHiveUsername: true,
      provider: true,
    },
  });

  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= now ||
    challenge.normalizedHiveUsername !== normalizedHiveUsername ||
    challenge.provider !== toDatabaseAuthProvider(input.provider) ||
    challenge.challengeHash !== sha256Hmac(input.message, input.hmacSecret)
  ) {
    throw new AuthChallengeError('Invalid or expired authentication challenge.');
  }

  const result = await database.authChallenge.updateMany({
    where: {
      id: input.challengeId,
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      consumedAt: now,
    },
  });

  if (result.count !== 1) {
    throw new AuthChallengeError('Invalid or expired authentication challenge.');
  }

  return normalizedHiveUsername;
}
