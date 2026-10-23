import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { ensurePlan } from '@apps/runway/store/actions/planActions';
import {
  startItemsListener,
  startVersionsListener,
} from '@apps/runway/store/listeners/itemListeners';
import { startPlanListener } from '@apps/runway/store/listeners/planListener';
import {
  setItems,
  setKeyStatus,
  setPlan,
  setVersions,
} from '@apps/runway/store/runwaySlice';

/**
 * Opens the plan: fetches the data key, creates the plan on first open, then
 * listens to it. `attempt` restarts it after a failure.
 */
export function useRunwaySync(uid: string | null, attempt: number) {
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);

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
      ];
    });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
    };
  }, [uid, keyStatus, dispatch]);
}
