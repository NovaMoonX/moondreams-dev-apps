import {
  GoogleAuthProvider,
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
import { doc, setDoc, updateDoc, waitForPendingWrites } from 'firebase/firestore';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AuthContext, AuthContextValue } from '@/hooks/useAuth';
import { clearUserInfoStore } from '@/hooks/useUserInfo';
import { ADMIN_EMAIL, APP_REGISTRY, clearAppResume } from '@/lib/app';
import { recordSiteVisit } from '@/lib/appUsage/appUsage';
import { grantEmulatorDevAccess } from '@/lib/dev/devAccess';
import { ensureDocExists } from '@/lib/firebase';
import {
  claimFirestoreLocalData,
  clearFirestoreLocalData,
  releaseFirestoreLocalData,
} from '@/lib/firebase/localData';
import {
  cacheRememberedPhoto,
  forgetAccount as forgetSavedAccount,
  readRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from '@/lib/auth/rememberedAccounts';
import { detachDevicePush, releaseDevicePush } from '@/lib/notifications/devicePush';
import { enablePushNotifications } from '@/lib/notifications/enablePushNotifications';
import { clearViewerSessions } from '@/utils/viewerSessionUtils';
import { clearFormDrafts } from '@lib/app/formDrafts';
import { resetAllState } from '@/store/actions/globalActions';
import { useAppDispatch } from '@/store/index';
import { setCurrentUser } from '@/store/slices/userSlice';
import { auth, db, googleProvider, realtimeDb } from '@lib/firebase/config';
import { getProviderPhotoURL } from '@/utils/accountUtils';
import { queryClient } from '@lib/query/queryClient';

const RELEASE_PUSH_WAIT_MS = 3000;

export function AuthProvider({ children }: PropsWithChildren) {
  const dispatch = useAppDispatch();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDisplayNameUpdating, setIsDisplayNameUpdating] = useState(false);
  const currentLocationRef = useRef('home');
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const isReloadingRef = useRef(false);
  const isSwitchingRef = useRef(false);
  const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccount[]>(readRememberedAccounts);

  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [user],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Firestore is already stopped and the page is about to reload; rendering now would start listeners on it.
      if (isReloadingRef.current) return;
      // Every account on this device shares Firestore's saved copy, and a read one account is refused
      // can be saved as "deleted" and hide that document from the next, so each account starts clean.
      if (firebaseUser && claimFirestoreLocalData(firebaseUser.uid)) {
        isReloadingRef.current = true;
        await clearFirestoreLocalData();
        window.location.reload();
        return;
      }
      const nextUserId = firebaseUser?.uid ?? null;
      const previousUserId = previousUserIdRef.current;

      if (previousUserId !== undefined && previousUserId !== nextUserId) {
        dispatch(resetAllState());
        queryClient.clear();
        clearUserInfoStore();
        if (previousUserId) {
          clearViewerSessions(previousUserId);
          clearFormDrafts(previousUserId);
        }
        clearAppResume();
      }

      previousUserIdRef.current = nextUserId;
      // Signed out from anywhere (another tab, an expired session): start again from Home, not the app's page.
      if (previousUserId && !nextUserId && window.location.pathname !== '/') {
        isReloadingRef.current = true;
        window.location.assign('/');
        return;
      }

      if (firebaseUser) {
        setRememberedAccounts(
          rememberAccount({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? null,
            displayName: firebaseUser.displayName ?? null,
            photoURL: getProviderPhotoURL(firebaseUser) ?? null,
          }),
        );
        void cacheRememberedPhoto(firebaseUser.uid).then(
          (accounts) => accounts && setRememberedAccounts(accounts),
        );
      }

      if (firebaseUser) {
        await grantEmulatorDevAccess(firebaseUser).catch((error) =>
          console.error('Failed to grant emulator dev access:', error),
        );
      }

      const nextUserState = firebaseUser
        ? {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? null,
            displayName: firebaseUser.displayName ?? null,
            photoURL: firebaseUser.photoURL ?? null,
            isAdmin:
              firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
          }
        : null;

      dispatch(setCurrentUser(nextUserState));
      setUser(firebaseUser);
      // Auth state itself is already known here — don't hold the loading
      // gate open waiting on background Firestore writes below (profile
      // sync, admin app provisioning). Those aren't required to render the
      // app and can be slow on a cold local emulator.
      setLoading(false);

      if (firebaseUser) {
        const isAdminUser =
          firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const profileRef = doc(db, 'users', firebaseUser.uid);

        setDoc(
          profileRef,
          {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
            photoURL: getProviderPhotoURL(firebaseUser) ?? '',
            isAdmin: isAdminUser,
          },
          { merge: true },
        ).catch((error) => console.error('Failed to sync user profile:', error));

        recordSiteVisit(firebaseUser.uid).catch((error) =>
          console.error('Failed to record site visit:', error),
        );

        if (isAdminUser) {
          Promise.all(
            APP_REGISTRY.map(async (app) => {
              const defaultData = {
                id: app.id,
                name: app.name,
                description: app.description,
                path: app.path,
                status: 'draft',
                isRestricted: false,
                isRequestable: false,
                allowedUsers: [],
                createdAt: app.createdAt
                  ? new Date(app.createdAt).toISOString()
                  : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              const docRef = doc(db, 'apps', app.id);
              await ensureDocExists(docRef, defaultData);
            }),
          ).catch((error) => console.error('Failed to provision app registry:', error));
        }
      }
    });

    return () => unsubscribe();
  }, [dispatch]);

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

  const switchAccount = useCallback(async (email: string | null) => {
    if (isSwitchingRef.current) return;
    if (!navigator.onLine) {
      throw new Error("You're offline. Switch accounts once you're back online.");
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters(
      email ? { prompt: 'select_account', login_hint: email } : { prompt: 'select_account' },
    );
    // The popup opens first, inside the tap, or a browser may block it.
    const signingIn = signInWithPopup(auth, provider);
    isSwitchingRef.current = true;
    const previousUid = auth.currentUser?.uid ?? null;
    const statusRef = previousUid ? ref(realtimeDb, `status/${previousUid}`) : null;
    if (previousUid && statusRef) {
      // While the picker is open the old account is still signed in: it sends what it hasn't yet,
      // marks itself offline and gives up this device's pushes (the server also moves the token on).
      void waitForPendingWrites(db).catch(() => undefined);
      void set(statusRef, { state: 'offline', currentLocation: null, lastChanges: serverTimestamp() }).catch(
        () => undefined,
      );
      void detachDevicePush(previousUid);
    }
    const stayAsBefore = () => {
      isSwitchingRef.current = false;
      if (!previousUid || !statusRef) return;
      void set(statusRef, {
        state: 'online',
        currentLocation: currentLocationRef.current,
        lastChanges: serverTimestamp(),
      }).catch(() => undefined);
      void enablePushNotifications(previousUid);
    };
    try {
      const result = await signingIn;
      // A different account reloads from the auth listener once the saved data is cleared.
      if (result.user.uid === previousUid) stayAsBefore();
    } catch (error) {
      stayAsBefore();
      const code = (error as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      throw error;
    }
  }, []);

  const forgetAccount = useCallback((uid: string) => {
    setRememberedAccounts(forgetSavedAccount(uid));
  }, []);

  const logOut = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const userStatusRef = ref(realtimeDb, `status/${uid}`);
      await Promise.race([
        Promise.allSettled([
          set(userStatusRef, {
            state: 'offline',
            currentLocation: null,
            lastChanges: serverTimestamp(),
          }),
          releaseDevicePush(uid),
        ]),
        new Promise((resolve) => setTimeout(resolve, RELEASE_PUSH_WAIT_MS)),
      ]);
    }

    currentLocationRef.current = 'home';
    if (auth.currentUser) {
      clearViewerSessions(auth.currentUser.uid);
      clearFormDrafts(auth.currentUser.uid);
    }
    clearAppResume();
    isReloadingRef.current = true;
    // Unsent edits stay queued for this account's next sign-in, so only a fully sent copy is cleared.
    const hasSentEverything = await Promise.race([
      waitForPendingWrites(db).then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), RELEASE_PUSH_WAIT_MS),
      ),
    ]).catch(() => false);
    if (hasSentEverything) {
      releaseFirestoreLocalData();
      await clearFirestoreLocalData();
    }
    await signOut(auth).catch((error) => console.error('Sign-out error:', error));
    window.location.href = '/';
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

  const updatePhotoURL = useCallback(
    async (photoURL: string | null) => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        return;
      }

      const nextPhotoURL =
        photoURL ?? getProviderPhotoURL(currentUser);

      await updateProfile(currentUser, { photoURL: nextPhotoURL ?? '' });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        customPhotoURL: photoURL,
      });

      dispatch(
        setCurrentUser({
          uid: currentUser.uid,
          email: currentUser.email ?? null,
          displayName: currentUser.displayName ?? null,
          photoURL: nextPhotoURL,
          isAdmin,
        }),
      );
      setUser({ ...currentUser });
    },
    [dispatch, isAdmin],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      signInWithGoogle,
      logOut,
      rememberedAccounts,
      switchAccount,
      forgetAccount,
      updateDisplayName,
      updatePhotoURL,
      setCurrentLocation,
      isDisplayNameUpdating,
    }),
    [
      user,
      loading,
      isAdmin,
      signInWithGoogle,
      logOut,
      rememberedAccounts,
      switchAccount,
      forgetAccount,
      updateDisplayName,
      updatePhotoURL,
      setCurrentLocation,
      isDisplayNameUpdating,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
