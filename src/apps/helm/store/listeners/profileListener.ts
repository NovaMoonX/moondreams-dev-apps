import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { HelmProfile } from '@apps/helm/types';

/** A profile written before a field existed reads that field as its default, never as missing. */
const toProfile = (data: Partial<HelmProfile>): HelmProfile => ({
  timeZone: data.timeZone ?? 'UTC',
  dayStartTime: data.dayStartTime ?? '08:00',
  dayEndTime: data.dayEndTime ?? '22:00',
  planFillPercent: data.planFillPercent ?? 50,
  createdAt: data.createdAt ?? 0,
  lastEditedAt: data.lastEditedAt ?? null,
});

export function startProfileListener(
  uid: string,
  onChange: (profile: HelmProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'helm', 'users', uid),
    (snapshot) =>
      onChange(
        snapshot.exists()
          ? toProfile(snapshot.data() as Partial<HelmProfile>)
          : null,
      ),
    onError,
  );
}
