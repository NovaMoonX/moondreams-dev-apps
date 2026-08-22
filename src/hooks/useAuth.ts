import { User } from 'firebase/auth';
import { createContext, useContext } from 'react';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
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