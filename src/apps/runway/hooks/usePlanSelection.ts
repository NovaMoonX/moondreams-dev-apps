import { createContext, useContext, useEffect, type RefObject } from 'react';

import { useBackStep } from '@/hooks/useBackHistory';
import { useSelection } from '@/hooks/useSelection';

export type SelectView = 'bills' | 'envelopes' | 'goals';

/** What the open view is picking, read by Plan's pills and swipe when they are used; null while nothing is being picked. */
export interface PlanSelectLock {
  view: SelectView;
  count: number;
  exit: () => void;
}

export const PlanSelectLockContext =
  createContext<RefObject<PlanSelectLock | null> | null>(null);

/** One Plan view's pick-several mode: it lives and ends with the view, and tells Plan's pills and swipe while it is on so neither leaves the view with ticks in it. */
export function usePlanSelection(view: SelectView, liveIds: readonly string[]) {
  const selection = useSelection();
  const lockRef = useContext(PlanSelectLockContext);
  const live = new Set(liveIds);
  const ticked = [...selection.ids].filter((id) => live.has(id));
  const count = ticked.length;
  const { isActive, exit, start, toggle } = selection;

  useBackStep(isActive, exit);

  useEffect(() => {
    if (!lockRef || !isActive) return;
    lockRef.current = { view, count, exit };
    return () => {
      lockRef.current = null;
    };
  }, [lockRef, isActive, view, count, exit]);

  const begin = (ids: readonly string[]) => {
    if (isActive) {
      toggle(ids);
      return;
    }
    start();
    toggle(ids);
  };

  return {
    isActive,
    ids: selection.ids,
    ticked,
    count,
    begin,
    toggle,
    exit,
  };
}
