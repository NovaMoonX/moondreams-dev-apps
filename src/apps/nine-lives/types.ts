export interface PendingHouseholdMember {
  uid: string;
  requestedAt: number;
}

export interface Household {
  id: string;
  name: string;
  members: string[];
  inviteCode: string | null;
  pendingMembers: PendingHouseholdMember[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
