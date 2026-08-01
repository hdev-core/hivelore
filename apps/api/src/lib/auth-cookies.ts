import type { FastifyReply, FastifyRequest } from 'fastify';

const REFRESH_COOKIE_NAME = 'hivelore_refresh';

export function getRefreshCookieName() {
  return REFRESH_COOKIE_NAME;
}

export function readCookie(request: FastifyRequest, name: string) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  options: {
    domain?: string | undefined;
    maxAgeSeconds: number;
    secure: boolean;
  },
) {
  const attributes = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/auth',
    'HttpOnly',
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.secure ? 'None' : 'Lax'}`,
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  if (options.domain) {
    attributes.push(`Domain=${options.domain}`);
  }

  reply.header('Set-Cookie', attributes.join('; '));
}

export function clearRefreshCookie(
  reply: FastifyReply,
  options: {
    domain?: string | undefined;
    secure: boolean;
  },
) {
  setRefreshCookie(reply, '', {
    domain: options.domain,
    maxAgeSeconds: 0,
    secure: options.secure,
  });
}
