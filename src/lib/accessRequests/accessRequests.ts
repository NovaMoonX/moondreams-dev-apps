import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

import type { AppListing } from '@lib/types/appCatalog';
import { queryOptions } from '@tanstack/react-query';

import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';
import { db } from '@lib/firebase/config';

/** Someone asking for an app at `apps/{appId}/accessRequests/{uid}`. It grants nothing: access stays the app's `allowedUsers`. */
export interface AccessRequest {
  uid: string;
  email: string | null;
  displayName: string | null;
  requestedAt: number;
  /** Set when the admin answers "Not now"; the person still sees their request as sent. */
  dismissedAt: number | null;
}

const requestRef = (appId: string, uid: string) => doc(db, 'apps', appId, 'accessRequests', uid);

export async function requestAccess(
  appId: string,
  person: { uid: string; email: string | null; displayName: string | null },
) {
  const request: AccessRequest = {
    uid: person.uid,
    email: person.email,
    displayName: person.displayName,
    requestedAt: Date.now(),
    dismissedAt: null,
  };
  await setDoc(requestRef(appId, person.uid), request);
}

export async function cancelAccessRequest(appId: string, uid: string) {
  await deleteDoc(requestRef(appId, uid));
}

export async function dismissAccessRequest(appId: string, uid: string) {
  await updateDoc(requestRef(appId, uid), { dismissedAt: Date.now() });
}

/** Removes the requests of people who were just given access. */
export async function clearAccessRequests(appId: string, uids: string[]) {
  if (uids.length === 0) return;
  const batch = writeBatch(db);
  uids.forEach((uid) => batch.delete(requestRef(appId, uid)));
  await batch.commit();
}

export const accessRequestKeys = {
  forApp: (appId: string) => [...ADMIN_QUERY_KEY, 'accessRequests', appId] as const,
};

/** Every request for one app, oldest first. Admin-only: the rules refuse anyone else a list. */
export function accessRequestsQueryOptions(appId: string) {
  return queryOptions({
    queryKey: accessRequestKeys.forApp(appId),
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'apps', appId, 'accessRequests'));
      const result = snapshot.docs
        .map((docSnap) => docSnap.data() as AccessRequest)
        .sort((left, right) => left.requestedAt - right.requestedAt);
      return result;
    },
    staleTime: 60_000,
  });
}

/** Publishes an app's name and description to members while it takes requests, and withdraws them when it stops. */
export async function syncAppListing(listing: AppListing, isListed: boolean) {
  const listingRef = doc(db, 'appListings', listing.id);
  if (isListed) {
    await setDoc(listingRef, listing);
    return;
  }
  await deleteDoc(listingRef);
}

/** Whether an access list (uids or emails, any case) already holds this person. */
export function isOnAccessList(allowedUsers: string[], uid: string, email: string | null) {
  return allowedUsers.some(
    (value) =>
      value.trim().toLowerCase() === uid.toLowerCase() ||
      (email !== null && value.trim().toLowerCase() === email.toLowerCase()),
  );
}
