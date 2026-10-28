import { useEffect, useRef, useState } from 'react';

import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import { useStore } from 'react-redux';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { rebuildClosings } from '@apps/runway/store/actions/closingActions';
import { setFailedRebuild } from '@apps/runway/store/runwaySlice';
import { selectRebuildNeedKey } from '@apps/runway/store/selectors/historySelectors';
import { selectIsPlanItemsLoaded } from '@apps/runway/store/selectors/runwaySelectors';

/** How long a finished rebuild is given for the plan to show it before the history stops waiting. */
const SETTLE_MS = 10_000;

/**
 * Rebuilds the closings when the history is waiting for them: the first time a plan with months behind
 * it opens, when a write into a closed month marked them stale, or when they have fallen two months
 * behind. One rebuild runs at a time; when it ends the plan is read again and anything still to do runs
 * next. A rebuild that fails leaves the plan on the newest closing that applies (or, with none, on a
 * "try again"), and `retry` clears that.
 */
export function useClosings(uid: string | null) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const needKey = useAppSelector(selectRebuildNeedKey);
  const isItemsLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const failedRebuild = useAppSelector((state) => state.runway.failedRebuild);
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const [round, setRound] = useState(0);
  const run = useRef({ isRunning: false, lastDone: '' });

  useEffect(() => {
    if (needKey === '') run.current.lastDone = '';
    if (
      !uid ||
      keyStatus !== 'ready' ||
      !isItemsLoaded ||
      needKey === '' ||
      run.current.isRunning ||
      run.current.lastDone === needKey
    ) {
      return;
    }
    run.current.isRunning = true;
    const billIds = new Set(
      store
        .getState()
        .runway.items.filter((item) => item.kind === 'bill')
        .map((item) => item.id),
    );

    getRunwayEncryption(uid)
      .then((encryption) => rebuildClosings(uid, encryption, billIds))
      .then(() => {
        run.current.lastDone = needKey;
        setTimeout(() => {
          const current = selectRebuildNeedKey(store.getState());
          if (current === needKey) dispatch(setFailedRebuild(needKey));
        }, SETTLE_MS);
      })
      .catch((error: unknown) => {
        console.error('The history was not updated', error);
        run.current.lastDone = '';
        dispatch(setFailedRebuild(needKey));
      })
      .finally(() => {
        run.current.isRunning = false;
        setRound((current) => current + 1);
      });
  }, [
    uid,
    keyStatus,
    isItemsLoaded,
    needKey,
    failedRebuild,
    round,
    dispatch,
    store,
  ]);

  const retry = () => {
    run.current.lastDone = '';
    dispatch(setFailedRebuild(null));
  };
  return { retry };
}
