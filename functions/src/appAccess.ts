import type { Firestore } from 'firebase-admin/firestore';

const ADMIN_EMAIL = 'nova@moondreams.dev';

export interface AccessAuth {
  uid: string;
  token: { email?: string; admin?: unknown; dev?: unknown };
}

// Matches the app catalog's client-side filter, which trims and lowercases the allowed list.
function canUseApp(
  app: FirebaseFirestore.DocumentData | undefined,
  uid: string,
  email: string | null,
) {
  if (!app || app.status !== 'public') return false;
  if (!app.isRestricted) return true;

  const allowedUsers = Array.isArray(app.allowedUsers)
    ? app.allowedUsers.map((value) => String(value).trim().toLowerCase())
    : [];
  const result =
    allowedUsers.includes(uid.toLowerCase()) ||
    (email !== null && allowedUsers.includes(email));
  return result;
}

/** Whether the signed-in person may open a site app: a privileged account always, anyone else when the app is public and, if restricted, lists them. */
export async function canOpenApp(
  firestore: Firestore,
  appId: string,
  auth: AccessAuth,
) {
  const email = auth.token.email?.trim().toLowerCase() ?? null;
  const isPrivileged =
    email === ADMIN_EMAIL ||
    auth.token.admin === true ||
    auth.token.dev === true;
  if (isPrivileged) return true;
  const appSnapshot = await firestore.doc(`apps/${appId}`).get();
  return canUseApp(appSnapshot.data(), auth.uid, email);
}
