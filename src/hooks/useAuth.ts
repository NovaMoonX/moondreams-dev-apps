import { User } from 'firebase/auth';
import { createContext, useContext } from 'react';

import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  /** Accounts used on this device, most recent first, the signed-in one included. */
  rememberedAccounts: RememberedAccount[];
  /** Opens Google's account picker (on `email` when given) and reloads as whoever is picked. Call it from a tap. */
  switchAccount: (email: string | null) => Promise<void>;
  /** Removes an account from this device's list and clears what the device saved for it. */
  forgetAccount: (uid: string) => void;
  updateDisplayName: (displayName: string) => Promise<void>;
  /** Sets the account photo; `null` reverts to the sign-in provider's photo. */
  updatePhotoURL: (photoURL: string | null) => Promise<void>;
  setCurrentLocation: (location: string) => void;
  isDisplayNameUpdating: boolean;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}