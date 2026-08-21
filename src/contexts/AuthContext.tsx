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
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AuthContext, AuthContextValue } from '@/hooks/useAuth';
import { ADMIN_EMAIL, APP_REGISTRY } from '@/lib/app';
import { ensureDocExists } from '@/lib/firebase';
import { auth, db, googleProvider, realtimeDb } from '@lib/firebase/config';

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDisplayNameUpdating, setIsDisplayNameUpdating] = useState(false);
  const currentLocationRef = useRef('home');

  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const isAdminUser =
          firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const profileRef = doc(db, 'users', firebaseUser.uid);
        await setDoc(
          profileRef,
          {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
            photoURL: firebaseUser.photoURL ?? '',
            isAdmin: isAdminUser,
          },
          { merge: true },
        );

        // await ensureDocExists(profileRef, {
        //   uid: firebaseUser.uid,
        //   email: firebaseUser.email ?? '',
        //   displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
        //   photoURL: firebaseUser.photoURL ?? '',
        //   isAdmin: isAdminUser,
        // });

        if (isAdminUser) {
          await Promise.all(
            APP_REGISTRY.map(async (app) => {
              const defaultData = {
                id: app.id,
                name: app.name,
                description: app.description,
                path: app.path,
                isRestricted: false,
                allowedUsers: [],
                createdAt: app.createdAt
                  ? new Date(app.createdAt).toISOString()
                  : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              const docRef = doc(db, 'apps', app.id);
              await ensureDocExists(docRef, defaultData);
            }),
          );
        }
      }

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

    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      return;
    }
    const userStatusRef = ref(realtimeDb, `status/${currentUserId}`);
    set(userStatusRef, {
      state: 'online',
      currentLocation: currentLocationRef.current,
      lastChanges: serverTimestamp(),
    });
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
    setIsDisplayNameUpdating(true);
    const trimmedName = displayName.trim();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    if (!trimmedName) {
      throw new Error('Display name cannot be empty.');
    }

    try {
      await updateProfile(currentUser, { displayName: trimmedName });

      // Update Firestore user profile doc for other users
      // calling `reload` here won't pick up the changes in onAuthStateChanged
      const profileRef = doc(db, 'users', currentUser.uid);
      await updateDoc(profileRef, { displayName: trimmedName });

      setUser(auth.currentUser ? { ...auth.currentUser } : null);
    } catch (error) {
      console.error('Error updating display name:', error);
    }

    setIsDisplayNameUpdating(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
      isDisplayNameUpdating,
    }),
    [
      user,
      loading,
      isAdmin,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
      isDisplayNameUpdating,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
