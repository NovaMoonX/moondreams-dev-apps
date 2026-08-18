export type AppId = 'worth-the-wait' | (string & {});

export interface AppMetadata {
  id: AppId;
  name: string;
  path: string;
  description: string;
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
