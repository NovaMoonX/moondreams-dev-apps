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
