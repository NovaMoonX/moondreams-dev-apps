import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { RECENT_DAYS_WINDOW } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
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
import { startPlanListener } from '@apps/runway/store/listeners/planListener';
import { endItem } from '@apps/runway/store/actions/itemActions';
import {
  selectConfirmedDayIds,
  selectReachedEndingsKey,
} from '@apps/runway/store/selectors/runwaySelectors';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  setDays,
  setItems,
  setKeyStatus,
  setMoves,
  setPlan,
  setRecords,
  setVersions,
} from '@apps/runway/store/runwaySlice';

/**
 * Opens the plan: fetches the data key, creates the plan on first open, then
 * listens to it. `attempt` restarts it after a failure.
 */
export function useRunwaySync(uid: string | null, attempt: number) {
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const confirmedDayIds = useAppSelector(selectConfirmedDayIds);
  const isPlanLoaded = useAppSelector(
    (state) =>
      state.runway.isItemsLoaded &&
      state.runway.isVersionsLoaded &&
      state.runway.isDaysLoaded,
  );
  const reachedEndings = useAppSelector((state) =>
    selectReachedEndingsKey(state, todayAsUtcDate()),
  );

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then(async (encryption) => {
        await ensurePlan(uid, encryption);
        if (run.isCurrent) dispatch(setKeyStatus('ready'));
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
        startDaysListener(
          uid,
          encryption,
          todayAsUtcDate() - RECENT_DAYS_WINDOW * DAY_MS,
          (days) => dispatch(setDays(days)),
          fail,
        ),
        startMovesListener(
          uid,
          encryption,
          todayAsUtcDate() - RECENT_DAYS_WINDOW * DAY_MS,
          (moves) => dispatch(setMoves(moves)),
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
            }),
          ),
        ),
      )
      .catch((error) => console.error('Marking an ending did not save', error));
  }, [uid, keyStatus, isPlanLoaded, reachedEndings]);
}
