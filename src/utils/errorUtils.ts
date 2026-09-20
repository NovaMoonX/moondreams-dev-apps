/**
 * Extracts a user-facing message from a caught error. Handles both real
 * `Error` instances and raw string payloads — Redux Toolkit's `unwrap()`
 * throws the bare string passed to `rejectWithValue`, not an `Error`.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

const STORAGE_ERROR_MESSAGES: Record<string, string> = {
  'storage/unauthorized': "You don't have permission to do that. Try refreshing the page and signing in again.",
  'storage/canceled': 'The upload was canceled.',
  'storage/quota-exceeded': 'Storage limit reached. Please contact support.',
  'storage/unauthenticated': 'You need to be signed in to do that. Try refreshing the page.',
  'storage/retry-limit-exceeded': 'The upload timed out. Check your connection and try again.',
  'storage/invalid-checksum': 'The file was corrupted during upload. Please try again.',
  'storage/object-not-found': 'That file could not be found.',
};

function getFirebaseErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = /storage\/[a-z-]+/.exec(message);

  return match?.[0] ?? null;
}

/**
 * Like `getErrorMessage`, but maps known Firebase Storage error codes to
 * plain, consumer-facing copy instead of surfacing raw Firebase error text
 * (e.g. "Firebase Storage: User does not have permission ... (storage/unauthorized)").
 */
export function getStorageErrorMessage(error: unknown, fallback: string): string {
  const code = getFirebaseErrorCode(error);

  if (code && STORAGE_ERROR_MESSAGES[code]) {
    return STORAGE_ERROR_MESSAGES[code];
  }

  return fallback;
}
