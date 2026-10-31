import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  startAdminUnreadFeedbackListener,
  startMyFeedbackListener,
} from '@/store/listeners/feedbackListeners';
import {
  setAdminUnread,
  setAdminUnreadStatus,
  setMyFeedback,
  setMyFeedbackStatus,
} from '@/store/slices/feedbackSlice';
import { useAppDispatch } from '@/store/index';

/** Central, app-wide: the signed-in person's feedback, and for the admin the count waiting for them. */
export function useFeedbackSync() {
  const { user, isAdmin } = useAuth();
  const dispatch = useAppDispatch();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      dispatch(setMyFeedbackStatus('loading'));
      return;
    }
    dispatch(setMyFeedbackStatus('loading'));
    return startMyFeedbackListener(
      uid,
      (items) => dispatch(setMyFeedback(items)),
      (error) => {
        console.error('Failed to load your feedback:', error);
        dispatch(setMyFeedbackStatus('error'));
      },
    );
  }, [uid, dispatch]);

  const isWatchingAdmin = uid !== null && isAdmin;
  useEffect(() => {
    if (!isWatchingAdmin) {
      dispatch(setAdminUnreadStatus('off'));
      return;
    }
    dispatch(setAdminUnreadStatus('loading'));
    return startAdminUnreadFeedbackListener(
      (count) => dispatch(setAdminUnread(count)),
      (error) => {
        console.error('Failed to load unread feedback:', error);
        dispatch(setAdminUnreadStatus('error'));
      },
    );
  }, [isWatchingAdmin, dispatch]);
}
