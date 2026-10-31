import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { FEATURE_GATES } from './gates.registry';

/** Who gets a feature before exceptions: nobody, the admin only, or everyone. */
export type GateRollout = 'off' | 'testing' | 'everyone';

export interface FeatureGateSetting {
  rollout: GateRollout;
  /** Exceptions win over the rollout; being kept out wins over being let in. */
  alwaysOnUids: string[];
  alwaysOffUids: string[];
  updatedAt: number | null;
}

/** One app's switches at `featureGates/{appId}`, keyed by switch id. */
export interface FeatureGatesDoc {
  appId: string;
  gates: Record<string, FeatureGateSetting>;
  updatedAt: number | null;
}

export interface GateViewer {
  uid: string;
  isAdmin: boolean;
}

export const GATE_ROLLOUTS: GateRollout[] = ['off', 'testing', 'everyone'];

function isGateRollout(value: unknown): value is GateRollout {
  return GATE_ROLLOUTS.includes(value as GateRollout);
}

function toUidList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

/** The stored setting for a switch, or its declared default when the admin hasn't set one. */
export function readGateSetting(
  gatesDoc: FeatureGatesDoc | null | undefined,
  appId: string,
  gateId: string,
): FeatureGateSetting {
  const declared = FEATURE_GATES.find(
    (gate) => gate.appId === appId && gate.id === gateId,
  );
  const stored = gatesDoc?.gates?.[gateId] as Partial<FeatureGateSetting> | undefined;
  const fallback = declared?.defaultRollout ?? 'off';

  return {
    rollout: isGateRollout(stored?.rollout) ? stored.rollout : fallback,
    alwaysOnUids: toUidList(stored?.alwaysOnUids),
    alwaysOffUids: toUidList(stored?.alwaysOffUids),
    updatedAt: typeof stored?.updatedAt === 'number' ? stored.updatedAt : null,
  };
}

function isOnByRollout(rollout: GateRollout, viewer: GateViewer | null) {
  if (rollout === 'everyone') return true;
  if (rollout === 'testing') return viewer?.isAdmin === true;
  return false;
}

export function isGateOpen(
  setting: FeatureGateSetting,
  viewer: GateViewer | null,
) {
  if (viewer && setting.alwaysOffUids.includes(viewer.uid)) return false;
  if (viewer && setting.alwaysOnUids.includes(viewer.uid)) return true;
  return isOnByRollout(setting.rollout, viewer);
}

export function startFeatureGatesListener(
  appId: string,
  onChange: (gatesDoc: FeatureGatesDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'featureGates', appId),
    (snapshot) =>
      onChange(snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null),
    (error) => {
      console.error('Failed to load feature switches:', error);
      onChange(null);
    },
  );
}

/** Admin only: replaces one switch's setting, leaving the app's other switches alone. */
export async function saveGateSetting(
  appId: string,
  gateId: string,
  setting: Omit<FeatureGateSetting, 'updatedAt'>,
) {
  const now = Date.now();
  await setDoc(
    doc(db, 'featureGates', appId),
    {
      appId,
      gates: {
        [gateId]: {
          rollout: setting.rollout,
          alwaysOnUids: Array.from(new Set(setting.alwaysOnUids)),
          alwaysOffUids: Array.from(new Set(setting.alwaysOffUids)),
          updatedAt: now,
        },
      },
      updatedAt: now,
    },
    { merge: true },
  );
}
