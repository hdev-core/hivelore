import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { PlatformRole } from '../generated/prisma/enums.js';

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256Hmac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export type AccessTokenClaims = {
  sub: string;
  hiveUsername: string;
  normalizedHiveUsername: string;
  platformRole: PlatformRole;
  sid: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export class JwtVerificationError extends Error {
  constructor() {
    super('Invalid access token.');
  }
}

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new JwtVerificationError();
  }
}

export function signAccessToken(
  claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'aud'>,
  options: {
    audience: string;
    issuer: string;
    secret: string;
    ttlSeconds: number;
    now?: Date;
  },
) {
  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const payload: AccessTokenClaims = {
    ...claims,
    aud: options.audience,
    exp: nowSeconds + options.ttlSeconds,
    iat: nowSeconds,
    iss: options.issuer,
  };
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', options.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  options: {
    audience: string;
    issuer: string;
    secret: string;
    now?: Date;
  },
) {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new JwtVerificationError();
  }

  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
  const expectedSignature = createHmac('sha256', options.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new JwtVerificationError();
  }

  const header = parseJson<{ alg?: string; typ?: string }>(base64UrlDecode(encodedHeader));

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new JwtVerificationError();
  }

  const claims = parseJson<AccessTokenClaims>(base64UrlDecode(encodedPayload));
  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const platformRoles = new Set<string>(Object.values(PlatformRole));

  if (
    claims.iss !== options.issuer ||
    claims.aud !== options.audience ||
    claims.exp <= nowSeconds ||
    !claims.sub ||
    !claims.sid ||
    !claims.normalizedHiveUsername ||
    !platformRoles.has(claims.platformRole)
  ) {
    throw new JwtVerificationError();
  }

  return claims;
}
