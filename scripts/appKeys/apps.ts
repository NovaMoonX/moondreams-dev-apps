import {
  keyCheckPath as connectionsKeyCheckPath,
  makeKeyCheck as makeConnectionsKeyCheck,
} from '../../functions/src/connections/connectionKey.ts';
import {
  makeKeyCheck as makeHelmKeyCheck,
  keyCheckPath as helmKeyCheckPath,
  wrappedKeyPath as helmWrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import type { KeyCheckDoc } from '../../functions/src/appKeys/canary.ts';
import type { Keyring } from '../../functions/src/appKeys/keyring.ts';
import {
  keyCheckPath as runwayKeyCheckPath,
  makeKeyCheck as makeRunwayKeyCheck,
  wrappedKeyPath as runwayWrappedKeyPath,
} from '../../functions/src/apps/runway/planKey.ts';

/** What a keyring tool needs to know about one app's key. */
export interface AppKeys {
  secretName: string;
  /** The environment variable a restored key comes in. */
  newKeyEnv: string;
  /** Only the drill's test document, so a scratch project never holds a real person's path. */
  wrappedKeyPath: (uid: string) => string;
  keyCheckPath: (masterKeyId: string) => string;
  makeKeyCheck: (
    keyring: Keyring,
    masterKeyId: string,
    now: number,
  ) => KeyCheckDoc;
  /** The document the drill writes, under this app's own path. */
  drillUid: string;
}

export const APP_KEYS = {
  runway: {
    secretName: 'RUNWAY_MASTER_KEYS',
    newKeyEnv: 'RUNWAY_NEW_KEY',
    wrappedKeyPath: runwayWrappedKeyPath,
    keyCheckPath: runwayKeyCheckPath,
    makeKeyCheck: makeRunwayKeyCheck,
    drillUid: 'drill-test-plan',
  },
  helm: {
    secretName: 'HELM_MASTER_KEYS',
    newKeyEnv: 'HELM_NEW_KEY',
    wrappedKeyPath: helmWrappedKeyPath,
    keyCheckPath: helmKeyCheckPath,
    makeKeyCheck: makeHelmKeyCheck,
    drillUid: 'drill-test-person',
  },
  connections: {
    secretName: 'CONNECTIONS_MASTER_KEYS',
    newKeyEnv: 'CONNECTIONS_NEW_KEY',
    wrappedKeyPath: (uid: string) =>
      `connectionsServer/${uid}/tokens/drill-test-account`,
    keyCheckPath: connectionsKeyCheckPath,
    makeKeyCheck: makeConnectionsKeyCheck,
    drillUid: 'drill-test-person',
  },
} as const satisfies Record<string, AppKeys>;

export type AppKeysName = keyof typeof APP_KEYS;

export const readAppFlag = (value: string | null): AppKeys => {
  if (value === 'runway' || value === 'helm' || value === 'connections')
    return APP_KEYS[value];
  throw new Error('Refused: --app is runway, helm or connections.');
};
