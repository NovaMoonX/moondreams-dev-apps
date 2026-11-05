import type { AppId } from '@lib/types/appCatalog';

import type { GateRollout } from './featureGates';

export interface FeatureGateEntry {
  id: string;
  appId: AppId;
  label: string;
  description: string;
  /** The rollout before the admin has set one; a feature already shipped to everyone stays `everyone`. */
  defaultRollout: GateRollout;
  /** The write the switch guards is refused by `isGateOpen` in `firestore.rules` too; `npm run check:gates` keeps the two in step. */
  isServerEnforced: boolean;
  /** A caution the admin reads before changing who has it, shown on its row and in its sheet; null when there is none. */
  warning: string | null;
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
    isServerEnforced: false,
    warning: null,
  },
  {
    id: 'calendar-releases',
    appId: 'a-list',
    label: 'Release days on the calendar',
    description:
      'Someone kept out sees only what they planned on their calendar, with no setting for release days. Everyone else sees the day a watchlist movie opens outlined in gold, and can hide it in Membership settings.',
    defaultRollout: 'everyone',
    isServerEnforced: false,
    warning: null,
  },
  {
    id: 'create-trips',
    appId: 'waypoint',
    label: 'Create trips',
    description:
      'Someone kept out sees the Create trip button locked. Trips they already made, and trips they join with a code or an invite, work as normal. Everyone else can start new trips.',
    defaultRollout: 'everyone',
    isServerEnforced: true,
    warning: null,
  },
  {
    id: 'create-sales',
    appId: 'going-once',
    label: 'Start sales',
    description:
      'Someone kept out sees the Start a sale button locked. Sales they are already in work as normal. Everyone else can start new sales.',
    defaultRollout: 'everyone',
    isServerEnforced: true,
    warning: null,
  },
  {
    id: 'link-banks',
    appId: 'runway',
    label: 'Link banks',
    description:
      'Someone without it never sees a way to link a bank, and adds cards and accounts by hand as before. Someone with it can sign in at their bank through Plaid and bring in its accounts, balances and purchases.',
    defaultRollout: 'off',
    isServerEnforced: false,
    warning:
      "Runway is on Plaid's Trial plan: 10 bank sign-ins in total for everyone, and one removed never frees its slot. Give this to its one tester only, until full production access is set up.",
  },
];

export function getAppFeatureGates(appId: string) {
  return FEATURE_GATES.filter((gate) => gate.appId === appId);
}
