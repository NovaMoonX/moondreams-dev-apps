export type AppId =
  | 'worth-the-wait'
  | 'nine-lives'
  | 'waypoint'
  | 'a-list'
  | 'pinch'
  | 'runway'
  | (string & {});

export type AppStatus = 'draft' | 'public' | 'removed';

export const APP_STATUS_OPTIONS: AppStatus[] = ['draft', 'public', 'removed'];

export function normalizeAppStatus(
  value: unknown,
  fallback: AppStatus = 'draft',
): AppStatus {
  if (value === 'draft' || value === 'public' || value === 'removed') {
    return value;
  }

  return fallback;
}

export interface AppMetadata {
  id: AppId;
  name: string;
  path: string;
  description: string;
  status: AppStatus;
  isRestricted: boolean;
  /** A restricted app people without access can see on Home and ask for. Stored `boolean | null`; missing reads as false. */
  isRequestable: boolean;
  allowedUsers: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  customPhotoURL?: string | null;
  isAdmin?: boolean;
}

/** A member's private site settings at `userPrefs/{uid}`; only they and the admin read it. */
export interface UserPrefs {
  uid: string;
  /** Oldest star first, so a new star joins the end of the starred group. */
  starredAppIds: string[];
  updatedAt: number;
}
