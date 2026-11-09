import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { generateUuid } from '@/utils';

interface SortResult {
  status: 'sorted' | 'received' | 'failed';
  executionId: string | null;
}

const sortHelmCaptureCallable = httpsCallable<
  { captureId: string; requestKey: string },
  SortResult
>(functions, 'sortHelmCapture');

/** Turns whose sorting call is out: the home line reads "Reading…" for them until the server's status says otherwise. */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const isSorting = (captureId: string) => inFlight.has(captureId);

export const subscribeSorting = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Asks the server to sort one saved turn, once. A failure is logged and leaves the turn saved as written. */
export async function sortCapture(captureId: string) {
  if (inFlight.has(captureId)) return;
  inFlight.add(captureId);
  notify();
  try {
    await sortHelmCaptureCallable({ captureId, requestKey: generateUuid() });
  } catch (error) {
    console.error('Helm could not sort a turn', error);
  } finally {
    inFlight.delete(captureId);
    notify();
  }
}
