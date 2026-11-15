import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@hooks/useAuth';

import { ownDebugProfileQueryOptions } from './debugProfileQueries';
import {
  readRememberedDebugAnswer,
  rememberDebugAnswer,
} from './debugProfiles';

function useDebugAccess() {
  const { user, isAdmin } = useAuth();
  const uid = user?.uid ?? null;
  const query = useQuery({
    ...ownDebugProfileQueryOptions(user?.email ?? null),
    enabled: Boolean(uid) && !isAdmin && Boolean(user?.email),
  });

  useEffect(() => {
    if (uid && query.data !== undefined) rememberDebugAnswer(uid, query.data);
  }, [uid, query.data]);

  const isListed =
    uid && !isAdmin ? (query.data ?? readRememberedDebugAnswer(uid)) : false;
  return { isAdmin, isListed };
}

/** Whether error screens show what failed: local builds, the admin, and listed emails. */
export function useCanSeeDebugDetails() {
  const { isAdmin, isListed } = useDebugAccess();
  return import.meta.env.DEV || isAdmin || isListed;
}

/** Whether the person is on the debug list; false for the admin, who sees details anyway. */
export function useIsDebugListed() {
  return useDebugAccess().isListed;
}
