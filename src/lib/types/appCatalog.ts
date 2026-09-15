export type AppId = 'worth-the-wait' | 'nine-lives' | 'waypoint' | (string & {});

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
  allowedUsers: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isAdmin?: boolean;
}
