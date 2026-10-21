import { queryOptions } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';

import { ADMIN_EMAIL } from '@lib/app';
import { db } from '@lib/firebase/config';
import type { UserProfile } from '@lib/types/appCatalog';

/** Every admin reporting read sits under this key, so one invalidation refreshes them all. */
export const ADMIN_QUERY_KEY = ['admin'] as const;

/** Every member except the admin, by email. A one-shot read: this list doesn't need to be live. */
export function adminUsersQueryOptions() {
  return queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'users'] as const,
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      const result = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as Partial<UserProfile>;
          return { uid: docSnap.id, ...data, photoURL: data.customPhotoURL || data.photoURL } as UserProfile;
        })
        .filter((profile) => profile.email !== ADMIN_EMAIL)
        .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
      return result;
    },
    staleTime: 60_000,
  });
}
