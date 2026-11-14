import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@hooks/useAuth';

import { ownDebugProfileQueryOptions } from './debugProfileQueries';
import {
  readRememberedDebugAnswer,
  rememberDebugAnswer,
} from './debugProfiles';

/** Whether error screens show what failed: local builds, the admin, and listed emails. */
export function useCanSeeDebugDetails() {
  const { user, isAdmin } = useAuth();
  const uid = user?.uid ?? null;
  const isLocal = import.meta.env.DEV || isAdmin;
  const query = useQuery({
    ...ownDebugProfileQueryOptions(user?.email ?? null),
    enabled: Boolean(uid) && !isLocal && Boolean(user?.email),
  });

  useEffect(() => {
    if (uid && query.data !== undefined) rememberDebugAnswer(uid, query.data);
  }, [uid, query.data]);

  if (isLocal) return true;
  if (!uid) return false;
  return query.data ?? readRememberedDebugAnswer(uid);
}
