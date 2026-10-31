import { doc, runTransaction } from 'firebase/firestore';

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
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
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
  const stored = gatesDoc?.gates?.[gateId] as
    Partial<FeatureGateSetting> | undefined;
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

export type GateExceptionList = 'alwaysOnUids' | 'alwaysOffUids';

/** What the admin chose for one switch, before it is saved. */
export type GateDraft = Pick<
  FeatureGateSetting,
  'rollout' | 'alwaysOnUids' | 'alwaysOffUids'
>;

function applyListChange(
  current: string[],
  before: string[],
  after: string[],
  otherAfter: string[],
) {
  const removed = before.filter((uid) => !after.includes(uid));
  const added = after.filter((uid) => !before.includes(uid));
  const kept = current.filter(
    (uid) => !removed.includes(uid) && !otherAfter.includes(uid),
  );
  return Array.from(new Set([...kept, ...added]));
}

/**
 * Admin only: saves the difference between what the sheet opened with and what the admin chose,
 * on top of the stored setting, so a change made elsewhere in the meantime is kept.
 */
export async function saveGateDraft(
  appId: string,
  gateId: string,
  before: GateDraft,
  after: GateDraft,
) {
  const gateRef = doc(db, 'featureGates', appId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(gateRef);
    const current = readGateSetting(
      snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null,
      appId,
      gateId,
    );
    const alwaysOnUids = applyListChange(
      current.alwaysOnUids,
      before.alwaysOnUids,
      after.alwaysOnUids,
      after.alwaysOffUids.filter((uid) => !before.alwaysOffUids.includes(uid)),
    );
    const alwaysOffUids = applyListChange(
      current.alwaysOffUids,
      before.alwaysOffUids,
      after.alwaysOffUids,
      after.alwaysOnUids.filter((uid) => !before.alwaysOnUids.includes(uid)),
    );
    transaction.set(
      gateRef,
      {
        appId,
        gates: {
          [gateId]: {
            rollout:
              after.rollout === before.rollout
                ? current.rollout
                : after.rollout,
            alwaysOnUids,
            alwaysOffUids,
            updatedAt: Date.now(),
          },
        },
      },
      { merge: true },
    );
  });
}
