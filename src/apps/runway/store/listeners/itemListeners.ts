import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import type {
  OpenVersion,
  PlanItemDoc,
  PlanVersionDoc,
  RunwayEncryption,
} from '@apps/runway/types';
import {
  openItem,
  openMatchKeys,
  openVersion,
} from '@apps/runway/engine/openDocs';
import { noteLocalWrite } from '@apps/runway/store/listeners/localWriteMark';

const planPath = (uid: string, name: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, name);

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

export function startItemsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (items: PlanItemDoc[]) => void,
  onMatchKeys: (keys: Record<string, string[]>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const stop = onSnapshot(
    planPath(uid, 'items'),
    (snapshot) => {
      noteLocalWrite(uid, snapshot);
      const headers = snapshot.docs.map((entry) => ({
        ...(entry.data() as Partial<PlanItemDoc>),
        id: entry.id,
      }));
      onChange(headers.map(openItem));
      sequence.latest += 1;
      const mine = sequence.latest;
      void openMatchKeys(headers, (sealed) =>
        openJson(sealed, encryption),
      ).then((keys) => {
        if (mine === sequence.latest) onMatchKeys(keys);
      });
    },
    (error) => onError(toError(error)),
  );
  return () => {
    sequence.latest += 1;
    stop();
  };
}

/** Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startVersionsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (versions: OpenVersion[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    planPath(uid, 'versions'),
    async (snapshot) => {
      noteLocalWrite(uid, snapshot);
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openVersion(
              { ...(entry.data() as PlanVersionDoc), id: entry.id },
              read,
            ),
          ),
        );
        if (mine === sequence.latest) {
          onChange(opened.filter((version) => version !== null));
        }
      } catch (error) {
        if (mine === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    sequence.latest += 1;
    stop();
  };
}
