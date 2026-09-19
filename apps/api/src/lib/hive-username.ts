const HIVE_ACCOUNT_MAX_LENGTH = 16;
const ACCOUNT_PART_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export class InvalidHiveUsernameError extends Error {
  constructor() {
    super('Invalid Hive username.');
  }
}

export function normalizeHiveUsername(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!isValidHiveUsername(normalized)) {
    throw new InvalidHiveUsernameError();
  }

  return normalized;
}

export function isValidHiveUsername(value: string) {
  if (value.length < 3 || value.length > HIVE_ACCOUNT_MAX_LENGTH) {
    return false;
  }

  if (value !== value.toLowerCase() || value.startsWith('.') || value.endsWith('.')) {
    return false;
  }

  const parts = value.split('.');

  return parts.every((part) => {
    if (part.length < 3) {
      return false;
    }

    return ACCOUNT_PART_PATTERN.test(part) && !part.includes('--');
  });
}
