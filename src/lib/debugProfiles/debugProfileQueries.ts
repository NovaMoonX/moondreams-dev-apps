import { queryOptions } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';
import { db } from '@lib/firebase/config';

import { toDebugProfileId, type DebugProfile } from './debugProfiles';

/** Every email that sees error details, for the admin. Under the admin key, so its refresh reloads it. */
export const debugProfilesQueryOptions = () =>
  queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'debugProfiles'] as const,
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'debugProfiles'));
      return snapshot.docs
        .map((docSnap) => docSnap.data() as DebugProfile)
        .sort((a, b) => a.email.localeCompare(b.email));
    },
    staleTime: 60_000,
  });

/** Whether the signed-in person's own email is listed. */
export const ownDebugProfileQueryOptions = (email: string | null) =>
  queryOptions({
    queryKey: ['debugProfiles', 'own', email] as const,
    // A refusal (an unverified email) is a no, so it replaces an earlier remembered yes.
    queryFn: async () =>
      getDoc(doc(db, 'debugProfiles', toDebugProfileId(email ?? '')))
        .then((snapshot) => snapshot.exists())
        .catch((error: { code?: string }) => {
          if (error.code === 'permission-denied') return false;
          throw error;
        }),
    enabled: Boolean(email),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
