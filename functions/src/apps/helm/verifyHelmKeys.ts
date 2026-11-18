import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { runKeyringCheck, type KeyCheckSpec } from '../../appKeys/canary.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from './getHelmKey.js';
import { KEY_CHECK_VALUE } from './helmKey.js';

const SPEC: KeyCheckSpec = {
  collectionPath: 'apps/helm/keyChecks',
  checkValue: KEY_CHECK_VALUE,
  eventPrefix: 'helm.keys',
};

export const verifyHelmKeys = onSchedule(
  {
    region: 'us-central1',
    schedule: '23 6 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 60,
    secrets: [HELM_MASTER_KEYS],
  },
  async () => {
    await runKeyringCheck(getFirestore(), SPEC, loadHelmKeyring);
  },
);
