import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { runKeyringCheck, type KeyCheckSpec } from '../appKeys/canary.js';
import { KEY_CHECK_COLLECTION, KEY_CHECK_VALUE } from './connectionKey.js';
import { CONNECTIONS_MASTER_KEYS, loadConnectionsKeyring } from './tokens.js';

if (getApps().length === 0) {
  initializeApp();
}

const SPEC: KeyCheckSpec = {
  collectionPath: KEY_CHECK_COLLECTION,
  checkValue: KEY_CHECK_VALUE,
  eventPrefix: 'connections.keys',
};

export const verifyConnectionKeys = onSchedule(
  {
    region: 'us-central1',
    schedule: '37 6 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 60,
    secrets: [CONNECTIONS_MASTER_KEYS],
  },
  async () => {
    await runKeyringCheck(getFirestore(), SPEC, loadConnectionsKeyring);
  },
);
