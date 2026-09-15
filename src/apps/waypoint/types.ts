export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';

export interface TripMember {
  uid: string;
  role: UserRole;
  joinedAt: number;
}

export interface TripSpace {
  id: string;
  title: string;
  coverImageUrl: string | null;
  startDate: number;
  endDate: number;
  defaultCurrency: string | null;
  members: Record<string, TripMember>;
  inviteCode: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
