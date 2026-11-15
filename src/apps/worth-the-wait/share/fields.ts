import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  PendingMember,
  UserPresence,
  ActiveAction,
  Space,
  RevealRequestedBy,
  RevealHistory,
  Box,
  Item,
  MemberUpdateSummary,
} from '@apps/worth-the-wait/types';

const PENDING_MEMBER_FIELDS = {
  uid: 'notUseful',
  requestedAt: 'notUseful',
} satisfies Record<keyof PendingMember, ShareDecision>;

const USER_PRESENCE_FIELDS = {
  state: 'notUseful',
  currentLocation: 'notUseful',
  lastChanges: 'notUseful',
} satisfies Record<keyof UserPresence, ShareDecision>;

const ACTIVE_ACTION_FIELDS = {
  actionId: 'notUseful',
  boxId: 'notUseful',
  method: 'notUseful',
  status: 'notUseful',
  selectedItemIds: 'notUseful',
  initiatedBy: 'notUseful',
  startedAt: 'notUseful',
  completedAt: 'notUseful',
} satisfies Record<keyof ActiveAction, ShareDecision>;

const SPACE_FIELDS = {
  id: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  members: 'filter',
  inviteCode: 'never',
  activeAction: 'notUseful',
  welcomeSeenBy: 'notUseful',
  encryption: 'filter',
} satisfies Record<keyof Space, ShareDecision>;

const REVEAL_REQUESTED_BY_FIELDS = {
  userId: 'notUseful',
  method: 'notUseful',
  requestedAt: 'notUseful',
} satisfies Record<keyof RevealRequestedBy, ShareDecision>;

const REVEAL_HISTORY_FIELDS = {
  id: 'never',
  method: 'never',
  triggeredBy: 'never',
  revealedAt: 'never',
  itemIds: 'never',
} satisfies Record<keyof RevealHistory, ShareDecision>;

const BOX_FIELDS = {
  id: 'notUseful',
  name: 'shared',
  emoji: 'shared',
  description: 'shared',
  isDefault: 'notUseful',
  createdBy: 'notUseful',
  revealRequestedBy: 'filter',
  revealHistory: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'notUseful',
} satisfies Record<keyof Box, ShareDecision>;

const ITEM_FIELDS = {
  id: 'never',
  authorId: 'never',
  content: 'never',
  isRevealed: 'filter',
  revealedAt: 'never',
  revealedMethod: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof Item, ShareDecision>;

const MEMBER_UPDATE_SUMMARY_FIELDS = {
  userId: 'notUseful',
  createdBoxes: 'notUseful',
  createdBoxNames: 'notUseful',
  updatedBoxes: 'notUseful',
  updatedBoxNames: 'notUseful',
  newItems: 'notUseful',
  newItemBoxNames: 'notUseful',
  newRevealRequests: 'notUseful',
  newRevealRequestBoxNames: 'notUseful',
  newReveals: 'notUseful',
  newRevealBoxNames: 'notUseful',
  lastSurfacedAt: 'notUseful',
  updatedAt: 'notUseful',
} satisfies Record<keyof MemberUpdateSummary, ShareDecision>;

/** What worth-the-wait lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  PendingMember: PENDING_MEMBER_FIELDS,
  UserPresence: USER_PRESENCE_FIELDS,
  ActiveAction: ACTIVE_ACTION_FIELDS,
  Space: SPACE_FIELDS,
  RevealRequestedBy: REVEAL_REQUESTED_BY_FIELDS,
  RevealHistory: REVEAL_HISTORY_FIELDS,
  Box: BOX_FIELDS,
  Item: ITEM_FIELDS,
  MemberUpdateSummary: MEMBER_UPDATE_SUMMARY_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {
  BoxDraft: 'form draft',
  ItemDraft: 'form draft',
};
