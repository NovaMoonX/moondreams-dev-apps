export type PendingMember = {
  uid: string;
  requestedAt: number; // timestamp
};

export type Space = {
  id: string;
  createdBy: string;
  createdAt: string | Date | Record<string, unknown> | null;
  members: string[];
  inviteCode: string | null;
  pendingMember: PendingMember | null;
  activeAction: Record<string, unknown> | null;
};
