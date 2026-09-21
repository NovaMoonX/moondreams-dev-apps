export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type ChecklistCategory =
  | 'DOCUMENTS'
  | 'PACKING'
  | 'BOOKINGS'
  | 'LOGISTICS'
  | 'OTHER';

export const CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  'DOCUMENTS',
  'PACKING',
  'BOOKINGS',
  'LOGISTICS',
  'OTHER',
];

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  DOCUMENTS: 'Documents',
  PACKING: 'Packing',
  BOOKINGS: 'Bookings',
  LOGISTICS: 'Logistics',
  OTHER: 'Other',
};

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
  isArchived: boolean;
  members: Record<string, TripMember>;
  inviteCode: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
}

export interface ChecklistItem {
  id: string;
  tripId: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  assignedToUids: string[];
  isCompleted: boolean;
  markedCompletedByUid: string | null;
  markedCompletedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
