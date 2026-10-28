import { useEffect } from 'react';

import { useNow } from '@/hooks/useNow';

import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  getChangeWindow,
  toChangeWindowKey,
} from '@apps/runway/utils/changeWindow';
import { startChangesListener } from '@apps/runway/store/listeners/changeListeners';
import { useAppDispatch, useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { ensurePlan } from '@apps/runway/store/actions/planActions';
import {
  startItemsListener,
  startVersionsListener,
} from '@apps/runway/store/listeners/itemListeners';
import {
  startDaysListener,
  startRecordsListener,
} from '@apps/runway/store/listeners/dayListeners';
import { startMovesListener } from '@apps/runway/store/listeners/moveListeners';
import { getSpendRange } from '@apps/runway/utils/spendPeriod';
import { startPurchasesListener } from '@apps/runway/store/listeners/purchaseListeners';
import { startClosingListener } from '@apps/runway/store/listeners/closingListeners';
import { startPlanListener } from '@apps/runway/store/listeners/planListener';
import { endItem } from '@apps/runway/store/actions/itemActions';
import {
  selectRecentFrom,
  toClosingKey,
} from '@apps/runway/store/selectors/historySelectors';
import {
  selectConfirmedDayIds,
  selectIsDaysLoaded,
  selectIsPlanItemsLoaded,
  selectReachedEndingsKey,
} from '@apps/runway/store/selectors/runwaySelectors';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  setChanges,
  setChangesFailed,
  setClosing,
  setDays,
  setItems,
  setKeyStatus,
  setLoadDay,
  setMoves,
  clearPeriodPurchases,
  setPeriodFailed,
  setPeriodPurchases,
  setPlan,
  setPurchases,
  setRecords,
  setVersions,
} from '@apps/runway/store/runwaySlice';

/**
 * Opens the plan: fetches the data key, creates the plan on first open, then
 * listens to it. `attempt` restarts it after a failure.
 */
export function useRunwaySync(uid: string | null, attempt: number) {
  const dispatch = useAppDispatch();
  const today = todayAsUtcDate(useNow(60_000));
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const confirmedDayIds = useAppSelector(selectConfirmedDayIds);
  const isItemsLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isPlanLoaded = isItemsLoaded && isDaysLoaded;
  const recentFrom = useAppSelector(selectRecentFrom);
  const closingKey = useAppSelector((state) =>
    toClosingKey(state.runway.plan?.dirtyFrom ?? null),
  );
  const reachedEndings = useAppSelector((state) =>
    selectReachedEndingsKey(state, today),
  );

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then(async (encryption) => {
        await ensurePlan(uid, encryption);
        if (!run.isCurrent) return;
        dispatch(setLoadDay(todayAsUtcDate()));
        dispatch(setKeyStatus('ready'));
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
    };
  }, [uid, attempt, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready') return;

    const stops: { current: (() => void)[] } = { current: [] };
    const run = { isCurrent: true };

    getRunwayEncryption(uid).then((encryption) => {
      if (!run.isCurrent) return;
      const fail = () => dispatch(setKeyStatus('failed'));
      stops.current = [
        startPlanListener(
          uid,
          encryption,
          (plan) => dispatch(setPlan(plan)),
          fail,
        ),
        startItemsListener(uid, (items) => dispatch(setItems(items)), fail),
        startVersionsListener(
          uid,
          encryption,
          (versions) => dispatch(setVersions(versions)),
          fail,
        ),
      ];
    });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
    };
  }, [uid, keyStatus, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready') return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const dirtyFrom = closingKey === 'none' ? null : closingKey;

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startClosingListener(
          uid,
          encryption,
          dirtyFrom,
          (closing) => dispatch(setClosing({ closing, key: closingKey })),
          () => dispatch(setKeyStatus('failed')),
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, closingKey, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || recentFrom === null) return;

    const stops: { current: (() => void)[] } = { current: [] };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        const fail = () => dispatch(setKeyStatus('failed'));
        stops.current = [
          startDaysListener(
            uid,
            encryption,
            recentFrom,
            (days) => dispatch(setDays({ from: recentFrom, days })),
            fail,
          ),
          startMovesListener(
            uid,
            encryption,
            recentFrom,
            (moves) => dispatch(setMoves({ from: recentFrom, moves })),
            fail,
          ),
          startPurchasesListener(
            uid,
            encryption,
            recentFrom,
            (purchases) =>
              dispatch(setPurchases({ from: recentFrom, purchases })),
            fail,
          ),
        ];
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
    };
  }, [uid, keyStatus, recentFrom, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || confirmedDayIds === null) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const dayIds = confirmedDayIds === '' ? [] : confirmedDayIds.split(',');

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startRecordsListener(
          uid,
          encryption,
          dayIds,
          (records) =>
            dispatch(setRecords({ dayIds: confirmedDayIds, records })),
          () => dispatch(setKeyStatus('failed')),
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, confirmedDayIds, dispatch]);

  const { moreEntry, logSpan, logPage, logItem, activeTab, spendPeriod } =
    useRunwayUrlState();
  const isSpendOpen = activeTab === 'spend';
  const {
    from: periodFrom,
    to: periodTo,
    key: periodKey,
  } = getSpendRange(spendPeriod, today);
  const isChangeLogOpen = moreEntry === 'changeLog';

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isSpendOpen) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startPurchasesListener(
          uid,
          encryption,
          periodFrom,
          (purchases) =>
            dispatch(setPeriodPurchases({ key: periodKey, purchases })),
          (error) => {
            console.error('The purchases did not open', error);
            dispatch(setPeriodFailed(periodKey));
          },
          periodTo,
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setPeriodFailed(periodKey));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
      dispatch(clearPeriodPurchases());
    };
  }, [uid, keyStatus, isSpendOpen, periodFrom, periodTo, periodKey, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isChangeLogOpen) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const window = getChangeWindow(today, Number(logSpan), logPage);
    const key = toChangeWindowKey(window, logItem);

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startChangesListener(
          uid,
          encryption,
          { ...window, itemId: logItem },
          (changes) => dispatch(setChanges({ key, changes })),
          (error) => {
            console.error('The change log did not open', error);
            dispatch(setChangesFailed(key));
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setChangesFailed(key));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [
    uid,
    keyStatus,
    isChangeLogOpen,
    logSpan,
    logPage,
    logItem,
    today,
    dispatch,
  ]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isPlanLoaded || reachedEndings === '')
      return;
    const rows = JSON.parse(reachedEndings) as [string, number, string][];
    getRunwayEncryption(uid)
      .then((encryption) =>
        Promise.all(
          rows.map(([itemId, endedOn, name]) =>
            endItem(uid, encryption, {
              itemId,
              endedOn,
              summary: `${name}: ended after its last payday, ${formatDateUTC(endedOn)}.`,
              note: null,
              heldChoice: null,
            }),
          ),
        ),
      )
      .catch((error) => console.error('Marking an ending did not save', error));
  }, [uid, keyStatus, isPlanLoaded, reachedEndings]);
}
