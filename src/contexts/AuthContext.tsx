import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
} from 'firebase/database';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AuthContext, AuthContextValue } from '@/hooks/useAuth';
import { auth, googleProvider, realtimeDb } from '@lib/firebase/config';

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const currentLocationRef = useRef('home');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const userStatusRef = ref(realtimeDb, `status/${user.uid}`);
    const connectedRef = ref(realtimeDb, '.info/connected');

    const updatePresence = (state: 'online' | 'offline') => {
      const payload = {
        state,
        currentLocation: currentLocationRef.current,
        lastChanges: serverTimestamp(),
      };

      set(userStatusRef, payload);
    };

    const unsubscribeConnected = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) {
        return;
      }

      updatePresence('online');
      onDisconnect(userStatusRef).set({
        state: 'offline',
        currentLocation: currentLocationRef.current,
        lastChanges: serverTimestamp(),
      });
    });

    return () => {
      unsubscribeConnected();
      onDisconnect(userStatusRef).cancel();
      updatePresence('offline');
    };
  }, [user]);

  const setCurrentLocation = useCallback((location: string) => {
    const nextLocation = location || 'home';
    currentLocationRef.current = nextLocation;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
    }
  }, []);

  const logOut = useCallback(async () => {
    if (auth.currentUser) {
      const userStatusRef = ref(realtimeDb, `status/${auth.currentUser.uid}`);
      await set(userStatusRef, {
        state: 'offline',
        currentLocation: null,
        lastChanges: serverTimestamp(),
      });
    }

    currentLocationRef.current = 'home';
    window.location.href = '/';
    await signOut(auth);
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const trimmedName = displayName.trim();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    if (!trimmedName) {
      throw new Error('Display name cannot be empty.');
    }

    await updateProfile(currentUser, { displayName: trimmedName });
    await currentUser.reload();
    setUser(auth.currentUser ? { ...auth.currentUser } : null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
    }),
    [
      user,
      loading,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
