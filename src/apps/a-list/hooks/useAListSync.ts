import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { startMembershipListener } from '@apps/a-list/store/listeners/membershipListeners';
import {
  clearMembership,
  setMembership,
} from '@apps/a-list/store/slices/membershipSlice';

export function useAListSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearMembership());
      return;
    }

    return startMembershipListener(uid, (membership) => {
      dispatch(setMembership(membership));
    });
  }, [dispatch, uid]);
}
