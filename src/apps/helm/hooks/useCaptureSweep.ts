import { useEffect, useRef } from 'react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { store, useAppSelector } from '@/store';
import {
  DAY_MS,
  RECENT_LIMIT_WINDOW_MS,
  SWEEP_LEASE_MS,
  SWEEP_RETRY_MS,
  SWEEP_RUN_LIMIT,
} from '@apps/helm/constants';
import { sortCapture, isSorting } from '@apps/helm/queries/nomosMutations';
import { rankStoredNotes } from '@apps/helm/store/actions/captureActions';
import type { OpenCapture } from '@apps/helm/types';

const isUtcDayOver = (heldAt: number, now: number) =>
  Math.floor(now / DAY_MS) > Math.floor(heldAt / DAY_MS);

const isHoldOver = (
  capture: OpenCapture,
  heldAt: number | undefined,
  now: number,
) => {
  if (heldAt === undefined) return true;
  if (capture.heldReason === null) return now - heldAt >= SWEEP_RETRY_MS;
  return capture.heldReason === 'recentLimit'
    ? now - heldAt >= RECENT_LIMIT_WINDOW_MS
    : isUtcDayOver(heldAt, now);
};

const isDue = (capture: OpenCapture, now: number, waiting: OpenCapture[]) => {
  const lead = capture.turnLeadId
    ? waiting.find((entry) => entry.id === capture.turnLeadId)
    : undefined;
  const isLeadWorking =
    lead !== undefined &&
    (lead.status === 'received' || lead.status === 'interpreting');
  return (
    !isLeadWorking &&
    (capture.status === 'received' ||
      (capture.status === 'interpreting' &&
        now - (capture.claimedAt ?? 0) > SWEEP_LEASE_MS))
  );
};

function createSweep() {
  const state = {
    isStopped: false,
    isRunning: false,
    heldAt: new Map<string, number>(),
    rerun: null as ReturnType<typeof setTimeout> | null,
  };

  const isActive = () =>
    !state.isStopped &&
    navigator.onLine &&
    store.getState().helm.keyStatus === 'ready';

  const sweepNext = async (tried: Set<string>): Promise<void> => {
    if (!isActive()) return;
    const now = Date.now();
    const waiting = store.getState().helm.waitingCaptures.captures;
    const next = waiting
      .filter(
        (capture) =>
          isDue(capture, now, waiting) &&
          !tried.has(capture.id) &&
          !capture.hasPendingWrites &&
          !isSorting(capture.id) &&
          isHoldOver(capture, state.heldAt.get(capture.id), now),
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    tried.add(next.id);
    const { kind } = await sortCapture(
      next.id,
      'full',
      rankStoredNotes(next.text),
    );
    if (kind === 'failed' || kind === 'notSorted') {
      state.heldAt.set(next.id, Date.now());
    }
    if (kind === 'held') {
      state.heldAt.set(next.id, Date.now());
      scheduleRerun();
      return;
    }
    return tried.size >= SWEEP_RUN_LIMIT ? undefined : sweepNext(tried);
  };

  const scheduleRerun = () => {
    if (state.isStopped || state.rerun !== null) return;
    state.rerun = setTimeout(() => {
      state.rerun = null;
      void run();
    }, RECENT_LIMIT_WINDOW_MS);
  };

  const run = async () => {
    if (state.isRunning) return;
    state.isRunning = true;
    try {
      await sweepNext(new Set());
    } finally {
      state.isRunning = false;
    }
  };

  return {
    run,
    stop: () => {
      state.isStopped = true;
      if (state.rerun !== null) clearTimeout(state.rerun);
    },
  };
}

/** Reads the turns that were saved as written while the AI, the limit or the connection was away: on open once the turns are in, when the device is back online and when the person returns to the page. One turn at a time, oldest first; a turn the server held waits out its window. */
export function useCaptureSweep(uid: string | null) {
  const isReady = useAppSelector(
    (state) =>
      state.helm.keyStatus === 'ready' && state.helm.waitingCaptures.isLoaded,
  );
  const sweep = useRef<ReturnType<typeof createSweep> | null>(null);

  useEffect(() => {
    if (!uid) return;
    const current = createSweep();
    sweep.current = current;
    return () => {
      current.stop();
      sweep.current = null;
    };
  }, [uid]);

  useEffect(() => {
    if (uid && isReady) void sweep.current?.run();
  }, [uid, isReady]);

  useEffect(() => {
    const handleOnline = () => void sweep.current?.run();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useOnTabReturn(() => void sweep.current?.run());
}
