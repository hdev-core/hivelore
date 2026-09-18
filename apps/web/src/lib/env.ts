const rawApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export function parsePublicApiUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured.');
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('NEXT_PUBLIC_API_BASE_URL must use http or https.');
    }

    return url.origin;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid URL.';
    throw new Error(`Invalid NEXT_PUBLIC_API_BASE_URL: ${message}`);
  }
}

export const env = {
  apiBaseUrl: parsePublicApiUrl(rawApiUrl),
} as const;
