import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateCurrentUser,
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
import { doc, getDoc, setDoc, updateDoc, waitForPendingWrites } from 'firebase/firestore';
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
import { takeInPlaceAuthChange } from '@/lib/dev/devSignOut';
import { ensureDocExists } from '@/lib/firebase';
import {
  claimFirestoreLocalData,
  clearFirestoreLocalData,
  releaseFirestoreLocalData,
} from '@/lib/firebase/localData';
import {
  dropAccountSession,
  getKeptSession,
  keepAccountSession,
  loadAccountSessions,
} from '@/lib/auth/accountSessions';
import {
  cacheRememberedPhoto,
  forgetAccount as forgetSavedAccount,
  readRememberedAccounts,
  refreshRememberedProfiles,
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
const ENDED_SESSION_CODES = new Set([
  'auth/user-token-expired',
  'auth/invalid-user-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

const toStringOrNull = (value: unknown) =>
  typeof value === 'string' && value ? value : null;

/** The name and photo each account shows on the site, read from its profile; an account whose profile can't be read is left out. */
async function readSiteProfiles(uids: string[]) {
  const profiles = await Promise.all(
    uids.map(async (uid) => {
      const snapshot = await getDoc(doc(db, 'users', uid)).catch(() => null);
      const data = snapshot?.data();
      if (!data) return null;
      return {
        uid,
        displayName: toStringOrNull(data.displayName),
        photoURL: toStringOrNull(data.customPhotoURL) ?? toStringOrNull(data.photoURL),
      };
    }),
  );
  return profiles.flatMap((profile) => (profile ? [profile] : []));
}

const cacheRememberedPhotos = async (uids: string[]) => {
  const results = await Promise.all(uids.map((uid) => cacheRememberedPhoto(uid)));
  return results.some(Boolean) ? readRememberedAccounts() : null;
};

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
    loadAccountSessions(readRememberedAccounts().map((account) => account.uid));
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Firestore is already stopped and the page is about to reload; rendering now would start listeners on it.
      if (isReloadingRef.current) return;
      const nextUserId = firebaseUser?.uid ?? null;
      const previousUserId = previousUserIdRef.current;
      const { pathname } = window.location;
      // A shared page reads the same for any account or none, so it stays; anywhere else starts again from Home.
      const isStayingOnPage = takeInPlaceAuthChange();
      const isLeavingPage = pathname !== '/' && !pathname.includes('/shared/') && !isStayingOnPage;
      // Any change to a different account starts again from Home, including one made in another tab.
      const isSwitchedAccount = Boolean(previousUserId && nextUserId && nextUserId !== previousUserId);
      if (isSwitchedAccount) isSwitchingRef.current = false;
      const isSwitchingHome = isSwitchedAccount && isLeavingPage;
      // Every account on this device shares Firestore's saved copy, and a read one account is refused
      // can be saved as "deleted" and hide that document from the next, so each account starts clean.
      const mustClearSavedData = Boolean(firebaseUser && claimFirestoreLocalData(firebaseUser.uid));
      if (mustClearSavedData || isSwitchingHome) {
        isReloadingRef.current = true;
        if (mustClearSavedData) await clearFirestoreLocalData();
        if (isSwitchingHome) {
          clearAppResume();
          window.location.assign('/');
        } else {
          window.location.reload();
        }
        return;
      }

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
      // Signed out from anywhere (another tab, an expired session) starts again from Home, not the app's page.
      if (previousUserId && !nextUserId && isLeavingPage) {
        isReloadingRef.current = true;
        dispatch(setCurrentUser(null));
        setUser(null);
        window.location.assign('/');
        return;
      }

      if (firebaseUser) {
        setRememberedAccounts(
          rememberAccount({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? null,
            displayName: firebaseUser.displayName ?? null,
            photoURL: firebaseUser.photoURL ?? getProviderPhotoURL(firebaseUser) ?? null,
          }),
        );
        void cacheRememberedPhoto(firebaseUser.uid).then(
          (accounts) => accounts && setRememberedAccounts(accounts),
        );
        void keepAccountSession(firebaseUser).catch((error) =>
          console.error('Failed to keep this account on the device:', error),
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

        const otherUids = readRememberedAccounts()
          .map((account) => account.uid)
          .filter((uid) => uid !== firebaseUser.uid);
        if (otherUids.length > 0) {
          void readSiteProfiles(otherUids)
            .then((profiles) => {
              const refreshed = refreshRememberedProfiles(profiles);
              if (refreshed) setRememberedAccounts(refreshed);
              return cacheRememberedPhotos(otherUids);
            })
            .then((accounts) => accounts && setRememberedAccounts(accounts));
        }

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

  const switchAccount = useCallback(async (account: Pick<RememberedAccount, 'uid' | 'email'> | null) => {
    if (isSwitchingRef.current) return;
    if (!navigator.onLine) {
      throw new Error("You're offline. Switch accounts once you're back online.");
    }
    const openGooglePicker = () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters(
        account?.email
          ? { prompt: 'select_account', login_hint: account.email }
          : { prompt: 'select_account' },
      );
      return signInWithPopup(auth, provider).then((result) => result.user);
    };
    const switchToKept = async (kept: User) => {
      try {
        await kept.getIdToken(true);
      } catch (error) {
        const code = (error as { code?: string }).code ?? '';
        if (!ENDED_SESSION_CODES.has(code)) throw error;
        await dropAccountSession(kept.uid);
        return openGooglePicker().catch((popupError: unknown) => {
          if ((popupError as { code?: string }).code !== 'auth/popup-blocked') throw popupError;
          throw new Error(
            `Your sign-in to ${account?.email ?? 'that account'} ended. Tap it again to sign in with Google.`,
          );
        });
      }
      await updateCurrentUser(auth, kept);
      return kept;
    };
    const kept = account ? getKeptSession(account.uid) : null;
    // The popup opens first, inside the tap, or a browser may block it.
    const signingIn = kept ? switchToKept(kept) : openGooglePicker();
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
      const signedInUser = await signingIn;
      // A different account lands on Home from the auth listener, once any saved data is cleared.
      if (signedInUser.uid === previousUid) stayAsBefore();
    } catch (error) {
      stayAsBefore();
      const code = (error as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      throw error;
    }
  }, []);

  const forgetAccount = useCallback((uid: string) => {
    void dropAccountSession(uid);
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
    if (uid) await dropAccountSession(uid);
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

      const refreshed = refreshRememberedProfiles([
        { uid: currentUser.uid, displayName: null, photoURL: nextPhotoURL },
      ]);
      if (refreshed) setRememberedAccounts(refreshed);
      void cacheRememberedPhoto(currentUser.uid).then(
        (accounts) => accounts && setRememberedAccounts(accounts),
      );

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
