// No imports on purpose: scripts/checks/gates.ts loads this file without the Functions dependencies installed.
export type GateRollout = 'off' | 'testing' | 'everyone';

export interface GateSetting {
  rollout?: unknown;
  alwaysOnUids?: unknown;
  alwaysOffUids?: unknown;
}

const toUids = (value: unknown) =>
  Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === 'string') : [];

/** The same answer as `isGateOpen` in src/lib/gates/gateAccess.ts and in firestore.rules (`npm run check:gates` holds the three together). */
export function isGateOpenFor(
  setting: GateSetting | undefined,
  defaultRollout: GateRollout,
  viewer: { uid: string; isAdmin: boolean },
) {
  const rollout =
    setting?.rollout === 'off' || setting?.rollout === 'testing' || setting?.rollout === 'everyone'
      ? setting.rollout
      : defaultRollout;
  if (toUids(setting?.alwaysOffUids).includes(viewer.uid)) return false;
  if (toUids(setting?.alwaysOnUids).includes(viewer.uid)) return true;
  return rollout === 'everyone' || (rollout === 'testing' && viewer.isAdmin);
}
