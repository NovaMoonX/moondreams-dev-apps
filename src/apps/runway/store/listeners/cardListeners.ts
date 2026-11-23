import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import { openCard } from '@apps/runway/engine/openDocs';
import type { CardDoc, OpenCard, RunwayEncryption } from '@apps/runway/types';
import { noteLocalWrite } from '@apps/runway/store/listeners/localWriteMark';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Every card, archived ones too. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startCardsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (cards: OpenCard[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'cards'),
    async (snapshot) => {
      noteLocalWrite(uid, snapshot);
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) =>
            openCard({ ...(entry.data() as CardDoc), id: entry.id }, read),
          ),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened);
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
