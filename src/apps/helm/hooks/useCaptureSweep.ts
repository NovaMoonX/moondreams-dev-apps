import { useEffect, useRef } from 'react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { store, useAppSelector } from '@/store';
import { RECENT_LIMIT_WINDOW_MS, SWEEP_LEASE_MS } from '@apps/helm/constants';
import { sortCapture, isSorting } from '@apps/helm/queries/nomosMutations';
import type { OpenCapture } from '@apps/helm/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const isUtcDayOver = (heldAt: number, now: number) =>
  Math.floor(now / DAY_MS) > Math.floor(heldAt / DAY_MS);

const isHoldOver = (
  capture: OpenCapture,
  heldAt: number | undefined,
  now: number,
) => {
  if (heldAt === undefined) return true;
  return capture.heldReason === 'recentLimit'
    ? now - heldAt >= RECENT_LIMIT_WINDOW_MS
    : isUtcDayOver(heldAt, now);
};

const isDue = (capture: OpenCapture, now: number) =>
  capture.status === 'received' ||
  (capture.status === 'interpreting' &&
    now - (capture.claimedAt ?? 0) > SWEEP_LEASE_MS);

function createSweep() {
  const state = {
    isStopped: false,
    isRunning: false,
    heldAt: new Map<string, number>(),
  };

  const isActive = () =>
    !state.isStopped &&
    navigator.onLine &&
    store.getState().helm.keyStatus === 'ready';

  const sweepNext = async (tried: Set<string>): Promise<void> => {
    if (!isActive()) return;
    const now = Date.now();
    const next = store
      .getState()
      .helm.waitingCaptures.captures.filter(
        (capture) =>
          isDue(capture, now) &&
          !tried.has(capture.id) &&
          !capture.hasPendingWrites &&
          !isSorting(capture.id) &&
          isHoldOver(capture, state.heldAt.get(capture.id), now),
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    tried.add(next.id);
    const outcome = await sortCapture(next.id);
    if (outcome === 'held') {
      state.heldAt.set(next.id, Date.now());
      return;
    }
    return sweepNext(tried);
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
