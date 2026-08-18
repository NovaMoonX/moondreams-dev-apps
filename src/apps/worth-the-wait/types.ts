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
