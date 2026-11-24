import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type { FiguresSnapshotSealed } from '@apps/runway/engine/figures';
import { openJson } from '@apps/runway/security';
import type { FiguresSnapshotDoc, RunwayEncryption } from '@apps/runway/types';
import type { OpenFiguresSnapshot } from '@apps/runway/utils/figuresSnapshot';

async function readFigures(
  stored: FiguresSnapshotDoc,
  encryption: RunwayEncryption,
): Promise<OpenFiguresSnapshot> {
  return {
    engineVersion: stored.engineVersion,
    asOf: stored.asOf,
    computedAt: stored.computedAt,
    planStamp: stored.planStamp,
    figures: await openJson<FiguresSnapshotSealed>(stored.sealed, encryption),
  };
}

/** The server's stored figures, opened. They are only a head start, so a failure to read or open them is a missing snapshot, never an error. */
export function startFiguresListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (snapshot: OpenFiguresSnapshot | null) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    doc(db, 'apps', 'runway', 'plans', uid, 'figures', 'current'),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      const opened = snapshot.exists()
        ? await readFigures(
            snapshot.data() as FiguresSnapshotDoc,
            encryption,
          ).catch(() => null)
        : null;
      if (mine === sequence.latest) onChange(opened);
    },
    () => onChange(null),
  );

  return () => {
    sequence.latest += 1;
    stop();
  };
}
