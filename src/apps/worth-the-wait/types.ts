export type PendingMember = {
  uid: string;
  requestedAt: number;
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
