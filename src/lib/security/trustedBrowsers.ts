import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';

import { httpsCallable } from 'firebase/functions';

import { auth, db, functions } from '@lib/firebase/config';
import { generateToken } from '@/utils/idUtils';

const BROWSER_ID_KEY = 'trusted-browser-id';
const DAY_MS = 24 * 60 * 60 * 1000;
export const BROWSER_ID_NOT_KEPT = 'browser-id-not-kept';

/** A browser that keeps a copy of one app's key for the person, as the list on their other browsers shows it. */
export type TrustedBrowser = {
  browserId: string;
  label: string;
  trustedAt: number;
  lastSeenAt: number;
};

type TrustedBrowserDoc = {
  name: string;
  browserId: string;
  label: string;
  trustedAt: Timestamp | null;
  lastSeenAt: Timestamp | null;
};

const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

const findName = (list: [RegExp, string][], text: string) =>
  list.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/** "Chrome on Android": the browser's own description, the closest a page can come to naming the device. */
export function describeThisBrowser() {
  const agent = navigator.userAgent;
  const browser = findName(BROWSERS, agent) ?? 'A browser';
  const system = findName(SYSTEMS, agent);
  return system ? `${browser} on ${system}` : browser;
}

const pageBrowserId = generateToken(20);

/** This browser's random id, kept in its storage; one that can't keep it gets a fresh id each visit. */
export function getBrowserId() {
  try {
    const kept = localStorage.getItem(BROWSER_ID_KEY);
    if (kept) return kept;
    localStorage.setItem(BROWSER_ID_KEY, pageBrowserId);
    return pageBrowserId;
  } catch {
    return pageBrowserId;
  }
}

const readKeptBrowserId = () => {
  try {
    return localStorage.getItem(BROWSER_ID_KEY);
  } catch {
    return null;
  }
};

const browsersOf = (uid: string) =>
  collection(db, 'trustedBrowsers', uid, 'browsers');
const browserDoc = (uid: string, name: string, browserId: string) =>
  doc(browsersOf(uid), `${name}:${browserId}`);

/** Fails where the browser can't keep its id: the next visit would not find its own entry. */
export async function registerTrustedBrowser(uid: string, name: string) {
  const browserId = getBrowserId();
  if (readKeptBrowserId() !== browserId)
    throw Object.assign(new Error('This browser cannot keep its id'), {
      code: BROWSER_ID_NOT_KEPT,
    });
  await setDoc(browserDoc(uid, name, browserId), {
    name,
    browserId,
    label: describeThisBrowser(),
    trustedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
}

export async function removeTrustedBrowser(
  uid: string,
  name: string,
  browserId = getBrowserId(),
) {
  await deleteDoc(browserDoc(uid, name, browserId));
}

/** Whether this browser is still on the person's list; `true` when the server can't be asked, so only a real removal forgets. */
export async function checkInTrustedBrowser(uid: string, name: string) {
  const ref = browserDoc(uid, name, getBrowserId());
  const snapshot = await getDocFromServer(ref).catch(() => null);
  if (!snapshot) return true;
  if (!snapshot.exists()) return false;
  const seenAt =
    (snapshot.data() as TrustedBrowserDoc).lastSeenAt?.toMillis() ?? 0;
  if (Date.now() - seenAt > DAY_MS) {
    await updateDoc(ref, { lastSeenAt: serverTimestamp() }).catch(
      () => undefined,
    );
  }
  return true;
}

/** The person's browsers that still keep this key, newest first; ones too long unseen to open anything are dropped from the list. */
export async function listTrustedBrowsers(
  uid: string,
  name: string,
  maxUnseenMs: number,
): Promise<TrustedBrowser[]> {
  const snapshot = await getDocs(
    query(browsersOf(uid), where('name', '==', name)),
  );
  const now = Date.now();
  const browsers = snapshot.docs.map((entry) => {
    const data = entry.data() as TrustedBrowserDoc;
    return {
      browserId: data.browserId,
      label: data.label,
      trustedAt: data.trustedAt?.toMillis() ?? now,
      lastSeenAt: data.lastSeenAt?.toMillis() ?? now,
    };
  });
  const stale = browsers.filter(
    (browser) => now - browser.lastSeenAt > maxUnseenMs,
  );
  stale.forEach((browser) => {
    void removeTrustedBrowser(uid, name, browser.browserId).catch(
      () => undefined,
    );
  });
  return browsers
    .filter((browser) => !stale.includes(browser))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Takes this browser off every list of the signed-in account, before it signs out. */
export async function forgetThisBrowserFor(uid: string) {
  if (auth.currentUser?.uid !== uid) return;
  const snapshot = await getDocs(
    query(browsersOf(uid), where('browserId', '==', getBrowserId())),
  );
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
}

const signOutEverywhereCallable = httpsCallable<void, { ok: true }>(
  functions,
  'signOutEverywhere',
);

/** Ends every trusted browser and every session of the signed-in account, on every app. Needs a connection. */
export async function signOutEverywhere() {
  await signOutEverywhereCallable();
}
