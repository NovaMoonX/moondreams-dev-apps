import type { AppId } from '@lib/types/appCatalog';

import type { GateRollout } from './featureGates';

export interface FeatureGateEntry {
  id: string;
  appId: AppId;
  label: string;
  description: string;
  /** The rollout before the admin has set one; a feature already shipped to everyone stays `everyone`. */
  defaultRollout: GateRollout;
}

/* Every switch the admin's Features tab offers. A switch stays while anyone is kept
   out of it; remove its entry (and the code reading it) only once it is on for
   everyone with no one kept out. */
export const FEATURE_GATES: FeatureGateEntry[] = [
  {
    id: 'archive',
    appId: 'a-list',
    label: 'Archive movies',
    description:
      'Someone kept out sees their archived movies back on the main list, with no Archive button. Everyone else can move a movie off the list with a reason and find it under Archived.',
    defaultRollout: 'everyone',
  },
];

export function getAppFeatureGates(appId: string) {
  return FEATURE_GATES.filter((gate) => gate.appId === appId);
}
