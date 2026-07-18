const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function parsePublicApiUrl(value: string): string {
  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('NEXT_PUBLIC_API_URL must use http or https.');
    }

    return url.origin;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid URL.';
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: ${message}`);
  }
}

export const env = {
  apiBaseUrl: parsePublicApiUrl(rawApiUrl),
} as const;
