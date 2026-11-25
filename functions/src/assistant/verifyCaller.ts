import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'firebase-functions/v2/https';

import { isRunningInEmulator } from '../emulator.js';

/** The signed-in person behind an HTTP request that carries their ID token and an App Check token, or why not. */
export async function verifyCaller(
  req: Request,
): Promise<{ uid: string } | { error: 'unauthenticated' | 'app-check' }> {
  const idToken =
    /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;
  const uid =
    idToken === null
      ? null
      : await getAuth()
          .verifyIdToken(idToken)
          .then((decoded) => decoded.uid)
          .catch(() => null);
  if (uid === null) return { error: 'unauthenticated' };
  const appCheckToken = req.header('X-Firebase-AppCheck');
  // The emulator cannot reach App Check, so a present header is taken as is there.
  const isAppCheckOk =
    !!appCheckToken &&
    (isRunningInEmulator() ||
      (await getAppCheck()
        .verifyToken(appCheckToken)
        .then(() => true)
        .catch(() => false)));
  return isAppCheckOk ? { uid } : { error: 'app-check' };
}
