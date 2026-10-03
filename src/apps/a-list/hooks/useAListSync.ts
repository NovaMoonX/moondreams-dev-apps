import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { startMembershipListener } from '@apps/a-list/store/listeners/membershipListeners';
import {
  clearMembership,
  setMembership,
  setMembershipLoadError,
} from '@apps/a-list/store/slices/membershipSlice';
import { getErrorMessage } from '@/utils/errorUtils';

export function useAListSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearMembership());
      return;
    }

    return startMembershipListener(
      uid,
      (membership) => {
        dispatch(setMembership(membership));
      },
      (error) => {
        dispatch(
          setMembershipLoadError(
            getErrorMessage(error, 'Unable to load your membership.'),
          ),
        );
      },
    );
  }, [dispatch, uid]);
}
