import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  startEmailEventsListener,
  startEmailIntakeListener,
  startEmailProgressListener,
} from '@apps/a-list/store/listeners/emailListeners';
import {
  clearEmail,
  setEmailEvents,
  setEmailIntake,
  setEmailLoadError,
  setEmailProgress,
} from '@apps/a-list/store/slices/emailSlice';

/** Listens to the forwarding address, its setup progress and the emails that arrived, only while the member has the switch and a membership. Email is optional, so a failure never blocks the calendar. */
export function useAListEmailSync(uid: string | null, isOpen: boolean) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid || !isOpen) return;
    const onError = (error: Error) =>
      dispatch(
        setEmailLoadError(
          getErrorMessage(error, 'Unable to load your ticket emails.'),
        ),
      );
    const stops = [
      startEmailIntakeListener(
        uid,
        (intake) => dispatch(setEmailIntake(intake)),
        onError,
      ),
      startEmailProgressListener(
        uid,
        (progress) => dispatch(setEmailProgress(progress)),
        onError,
      ),
      startEmailEventsListener(
        uid,
        (events) => dispatch(setEmailEvents(events)),
        onError,
      ),
    ];
    return () => {
      stops.forEach((stop) => stop());
      dispatch(clearEmail());
    };
  }, [dispatch, uid, isOpen]);
}
