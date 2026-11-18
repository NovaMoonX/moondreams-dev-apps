import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  checkKeyring,
  runKeyringCheck,
  type KeyCheckSpec,
} from '../../appKeys/canary.js';
import type { Keyring } from '../../appKeys/keyring.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { KEY_CHECK_VALUE } from './planKey.js';

export type { KeyFailure, KeyFailureReason } from '../../appKeys/canary.js';

const SPEC: KeyCheckSpec = {
  collectionPath: 'apps/runway/keyChecks',
  checkValue: KEY_CHECK_VALUE,
  eventPrefix: 'runway.keys',
};

/** Every id in the keyring must open its canary, and every canary must have its id in the keyring. Ids and reasons only; nothing else leaves. */
export const checkRunwayKeys = (
  firestore: Firestore,
  load: () => Keyring = loadKeyring,
) => checkKeyring(firestore, SPEC, load);

/** One structured entry per run: `runway.keys.ok` at INFO, `runway.keys.failed` at ERROR. */
export const runKeyCheck = (
  firestore: Firestore,
  load: () => Keyring = loadKeyring,
) => runKeyringCheck(firestore, SPEC, load);

export const verifyRunwayKeys = onSchedule(
  {
    region: 'us-central1',
    schedule: '17 6 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 60,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    await runKeyCheck(getFirestore());
  },
);
