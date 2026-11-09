import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { generateUuid } from '@/utils';

interface SortResult {
  status: 'sorted' | 'received' | 'failed';
  executionId: string | null;
}

export type SortMode = 'full' | 'rest';

/** `held` when the server's limit or budget turned the call away; the turn then carries why. */
export type SortOutcome = 'done' | 'held' | 'failed' | 'skipped';

const sortHelmCaptureCallable = httpsCallable<
  { captureId: string; requestKey: string; mode: SortMode },
  SortResult
>(functions, 'sortHelmCapture');

/** Turns whose sorting call is out: the home line reads "Reading…" for them until the server's status says otherwise. */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const isSorting = (captureId: string) => inFlight.has(captureId);

/** Turns whose last call in this tab failed for want of a connection or an answer in time, so a waiting turn can say the service couldn't be reached. */
const unreachable = new Set<string>();

export const isUnreachable = (captureId: string) => unreachable.has(captureId);

export const subscribeSorting = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const isConnectionError = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  (error.code === 'functions/unavailable' ||
    error.code === 'functions/deadline-exceeded');

/** Asks the server to sort one saved turn, once. A failure is logged and leaves the turn saved as written. */
export async function sortCapture(
  captureId: string,
  mode: SortMode = 'full',
): Promise<SortOutcome> {
  if (inFlight.has(captureId)) return 'skipped';
  inFlight.add(captureId);
  notify();
  try {
    await sortHelmCaptureCallable({
      captureId,
      requestKey: generateUuid(),
      mode,
    });
    unreachable.delete(captureId);
    return 'done';
  } catch (error) {
    const isHeld =
      error instanceof Error &&
      'code' in error &&
      error.code === 'functions/resource-exhausted';
    if (!isHeld) console.error('Helm could not sort a turn', error);
    if (isConnectionError(error)) unreachable.add(captureId);
    else unreachable.delete(captureId);
    return isHeld ? 'held' : 'failed';
  } finally {
    inFlight.delete(captureId);
    notify();
  }
}
