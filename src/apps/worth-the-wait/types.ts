import type { SpaceEncryption as BaseSpaceEncryption } from '@lib/security';

export type PendingMember = {
  uid: string;
  requestedAt: number;
};

export type UserPresence = {
  state: 'online' | 'offline';
  currentLocation: string | null;
  lastChanges: number | null;
};

export type ActiveActionStatus = 'initiating' | 'executing' | 'completed';

export type SpaceEncryption = BaseSpaceEncryption<'worth-the-wait'>;

export type ActiveAction = {
  actionId: string;
  boxId: string;
  method: RevealMethod;
  status: ActiveActionStatus;
  selectedItemIds: string[];
  initiatedBy: string;
  startedAt: number;
  completedAt: number | null;
};

export type Space = {
  id: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  members: string[];
  inviteCode: string | null;
  pendingMember: PendingMember | null;
  activeAction: ActiveAction | null;
  welcomeSeenBy: Record<string, number>;
  encryption: SpaceEncryption | null;
};

export type RevealMethod = 'full_reveal' | 'raffle';

export type RevealRequestedBy = {
  userId: string;
  method: RevealMethod;
  requestedAt: number;
};

export type RevealHistory = {
  id: string;
  method: RevealMethod;
  triggeredBy: string;
  revealedAt: number;
  itemIds: string[];
};

export type Box = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  isDefault: boolean;
  createdBy: string;
  revealRequestedBy: RevealRequestedBy[];
  revealHistory: RevealHistory[];
  createdAt: number;
  lastEditedAt: number;
};

export type BoxDraft = {
  name: string;
  emoji: string;
  description: string;
};

export type Item = {
  id: string;
  authorId: string;
  content: string;
  isRevealed: boolean;
  revealedAt: number | null;
  revealedMethod: RevealMethod | null;
  createdAt: number;
  lastEditedAt: number;
};

export type ItemDraft = {
  content: string;
};
