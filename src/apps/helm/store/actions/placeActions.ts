import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson, sealJson } from '@apps/helm/security';
import {
  type EditResult,
  forgetWithPhotos,
} from '@apps/helm/store/actions/whoActions';
import { keepInheritedPrivate } from '@apps/helm/store/actions/privacyActions';
import type {
  HelmEncryption,
  Place,
  PlaceSealed,
  Sealed,
} from '@apps/helm/types';

/** The fields a person edits on a place. */
export interface PlaceEdit {
  name: string;
  aliases: string[];
  address: string | null;
  isHome: boolean;
}

const placesOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'places');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

/** Changes a place's name, aliases and address, and which one is home, in one transaction that re-reads them: choosing home clears the old one in the same commit, and notes are kept. Needs a connection. */
export async function updatePlace(
  uid: string,
  encryption: HelmEncryption,
  placeId: string,
  edit: PlaceEdit,
): Promise<EditResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(placesOf(uid), placeId);
  try {
    const otherHomeIds = edit.isHome
      ? (await getDocs(query(placesOf(uid), where('isHome', '==', true)))).docs
          .map((entry) => entry.id)
          .filter((id) => id !== placeId)
      : [];
    return await runTransaction(
      db,
      async (transaction): Promise<EditResult> => {
        const snapshot = await transaction.get(ref);
        const others = await Promise.all(
          otherHomeIds.map((id) => transaction.get(doc(placesOf(uid), id))),
        );
        if (!snapshot.exists()) return 'missing';
        const opened = await openJson<PlaceSealed>(
          (snapshot.data() as Place).sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const { isHome, ...words } = edit;
        const sealed = await sealJson<PlaceSealed>(
          { ...opened, ...words },
          encryption,
        );
        const now = Date.now();
        others
          .filter((other) => other.exists() && other.data()?.isHome === true)
          .forEach((other) =>
            transaction.update(other.ref, { isHome: false, lastEditedAt: now }),
          );
        transaction.update(ref, { sealed, isHome, lastEditedAt: now });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export const forgetPlace = async (uid: string, placeId: string) => {
  await keepInheritedPrivate(uid, 'place', placeId);
  return forgetWithPhotos(uid, 'places', placeId);
};
