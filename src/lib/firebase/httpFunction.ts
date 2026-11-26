import { getToken } from 'firebase/app-check';

import {
  app,
  appCheck,
  auth,
  isUsingFirebaseEmulators,
} from '@lib/firebase/config';

/** The address of one of the site's HTTP functions, on the emulator when the app runs against it. */
export const getHttpFunctionUrl = (name: string) => {
  const { projectId } = app.options;
  return isUsingFirebaseEmulators
    ? `http://${window.location.hostname}:5001/${projectId}/us-central1/${name}`
    : `https://us-central1-${projectId}.cloudfunctions.net/${name}`;
};

/** The signed-in person's ID token and an App Check token as headers for an HTTP function that checks both; null when signed out or App Check is off. */
export const getSignedHeaders = async () => {
  await auth.authStateReady();
  const { currentUser } = auth;
  const check = appCheck;
  if (!currentUser || !check) return null;
  const [idToken, appCheckToken] = await Promise.all([
    currentUser.getIdToken(),
    getToken(check).catch(() => getToken(check, true)),
  ]);
  return {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': appCheckToken.token,
  };
};
