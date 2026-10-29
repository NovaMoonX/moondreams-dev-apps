import { AIError } from 'firebase/ai';

/** One warm sentence for a failed AI reading, chosen by its cause (busy, offline, service down, unavailable, unreadable; a caller with no photo to retake passes its own unreadable sentence); the detail is for the console. */
export function getAiReadFailureMessage(
  error: unknown,
  options: { subject: string; fallback: string; unreadable?: string },
) {
  const { subject, fallback, unreadable } = options;
  const status =
    error instanceof AIError ? error.customErrorData?.status : undefined;
  if (status === 429) {
    return `The reader is busy right now. Give it a minute and try again, or ${fallback}.`;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "You're offline. Connect and try again.";
  }
  const isUnavailable =
    (typeof status === 'number' && status >= 500) ||
    (error instanceof Error && /UNAVAILABLE|\[5\d\d\b/.test(error.message));
  if (isUnavailable) {
    return 'The reading service is busy right now. Try again in a minute.';
  }
  if (
    error instanceof AIError &&
    error.code === 'fetch-error' &&
    status === undefined
  ) {
    return `We couldn't reach the reader. Check your connection and try again, or ${fallback}.`;
  }
  if (status === 403 || status === 404) {
    return `The ${subject} reader isn't available right now. You can ${fallback}.`;
  }
  return (
    unreadable ??
    `We couldn't read that right now. Try a clearer photo or a PDF, or ${fallback}.`
  );
}
