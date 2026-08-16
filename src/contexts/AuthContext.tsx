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
import { auth, db, googleProvider, realtimeDb } from '@lib/firebase/config';

async function ensureAppDocExists(appId: string, defaultData: Record<string, unknown>) {
  const docRef = doc(db, 'apps', appId);

  try {
    // If the document already exists, this is a no-op that preserves its current values.
    // The empty object means we intentionally do not overwrite any existing fields.
    await updateDoc(docRef, {});
  } catch (error) {
    // Firestore throws a 'not-found' error when the document does not exist yet.
    // In that case, we create the default record safely without touching any user-edited values.
    const firebaseError = error as { code?: string };

    if (firebaseError.code === 'not-found') {
      await setDoc(docRef, defaultData);
    }
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const currentLocationRef = useRef('home');

  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const isAdminUser = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
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

              await ensureAppDocExists(app.id, defaultData);
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
      isAdmin,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
    }),
    [
      user,
      loading,
      isAdmin,
      signInWithGoogle,
      logOut,
      updateDisplayName,
      setCurrentLocation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
