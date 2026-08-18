export type PendingMember = {
  uid: string;
  requestedAt: number;
};

export type UserPresence = {
  state: 'online' | 'offline';
  currentLocation: string | null;
  lastChanges: number | null;
};

export type Space = {
  id: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  members: string[];
  inviteCode: string | null;
  pendingMember: PendingMember | null;
  activeAction: Record<string, unknown> | null;
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
