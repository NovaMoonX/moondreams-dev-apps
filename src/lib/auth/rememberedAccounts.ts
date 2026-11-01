import { resizeImageToWebp } from '@/utils/imageCompression';

const STORAGE_KEY = 'remembered-accounts';
const CACHED_PHOTO_SIZE = 96;
const REFUSED_PHOTO_RETRY_MS = 3 * 24 * 60 * 60 * 1000;

/** An account used on this device, kept so the avatar menu can offer a switch; profile details only, never a credential. */
export interface RememberedAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** A small copy of `photoURL` saved on this device, so the photo still shows once that account is signed out; `dataURL` is `null` when the read failed, retried after a few days. */
  cachedPhoto: {
    sourceURL: string;
    dataURL: string | null;
    failedAt: number | null;
  } | null;
  lastUsedAt: number;
}

function isRememberedAccount(value: unknown): value is RememberedAccount {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RememberedAccount).uid === 'string'
  );
}

const withCachedPhoto = (account: RememberedAccount): RememberedAccount => ({
  ...account,
  cachedPhoto: account.cachedPhoto
    ? { ...account.cachedPhoto, failedAt: account.cachedPhoto.failedAt ?? null }
    : null,
});

const hasCurrentPhotoCopy = (account: RememberedAccount) => {
  const cached = account.cachedPhoto;
  if (!cached || cached.sourceURL !== account.photoURL) return false;
  if (cached.dataURL) return true;
  const age = Date.now() - (cached.failedAt ?? 0);
  return age >= 0 && age < REFUSED_PHOTO_RETRY_MS;
};

export function readRememberedAccounts(): RememberedAccount[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed
          .filter(isRememberedAccount)
          .map(withCachedPhoto)
          .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
      : [];
  } catch {
    return [];
  }
}

function writeRememberedAccounts(accounts: RememberedAccount[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    return true;
  } catch {
    // Without storage the menu just offers no other accounts.
    return false;
  }
}

/** The photo to draw for a remembered account: the saved copy when it matches the current photo, else the photo's own URL. */
export function getRememberedPhoto(account: RememberedAccount) {
  return account.cachedPhoto?.sourceURL === account.photoURL
    ? (account.cachedPhoto?.dataURL ?? account.photoURL)
    : account.photoURL;
}

/** Puts this account first in the device's list, refreshing its name and photo. */
export function rememberAccount(
  account: Omit<RememberedAccount, 'lastUsedAt' | 'cachedPhoto'>,
) {
  const saved = readRememberedAccounts();
  const previous = saved.find((entry) => entry.uid === account.uid);
  const others = saved.filter((entry) => entry.uid !== account.uid);
  const next = [
    {
      ...account,
      cachedPhoto: previous?.cachedPhoto ?? null,
      lastUsedAt: Date.now(),
    },
    ...others,
  ];
  writeRememberedAccounts(next);
  return next;
}

/** Brings the saved name and photo of these accounts up to date with their site profiles, keeping the list's order. */
export function refreshRememberedProfiles(
  profiles: Pick<RememberedAccount, 'uid' | 'displayName' | 'photoURL'>[],
) {
  const byUid = new Map(profiles.map((profile) => [profile.uid, profile]));
  const saved = readRememberedAccounts();
  const next = saved.map((entry) => {
    const profile = byUid.get(entry.uid);
    return profile
      ? {
          ...entry,
          displayName: profile.displayName ?? entry.displayName,
          photoURL: profile.photoURL ?? entry.photoURL,
        }
      : entry;
  });
  const hasChanged = next.some(
    (entry, index) =>
      entry.displayName !== saved[index].displayName ||
      entry.photoURL !== saved[index].photoURL,
  );
  if (!hasChanged) return null;
  writeRememberedAccounts(next);
  return next;
}

async function readPhotoAsDataURL(url: string) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Photo request failed: ${response.status}`);
  const blob = await response.blob();
  const original = new File([blob], 'photo', { type: blob.type });
  const resized = await resizeImageToWebp(original, CACHED_PHOTO_SIZE);
  if (resized === original) throw new Error('Photo could not be decoded');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(resized);
  });
}

/** Saves a small copy of the account's photo on this device when it has none for that photo yet; returns the new list, or `null` when nothing was saved. */
export async function cacheRememberedPhoto(uid: string) {
  const account = readRememberedAccounts().find((entry) => entry.uid === uid);
  const sourceURL = account?.photoURL;
  if (!sourceURL || hasCurrentPhotoCopy(account) || !navigator.onLine) {
    return null;
  }
  // A refused cross-origin read looks the same as a dropped connection, so a failure is retried after a few days.
  const dataURL = await readPhotoAsDataURL(sourceURL).catch(() => null);
  const failedAt = dataURL ? null : Date.now();
  const next = readRememberedAccounts().map((entry) =>
    entry.uid === uid && entry.photoURL === sourceURL
      ? { ...entry, cachedPhoto: { sourceURL, dataURL, failedAt } }
      : entry,
  );
  return writeRememberedAccounts(next) && dataURL ? next : null;
}

/** Drops an account from the device's list along with the keys this device saved under its uid (`…:<uid>…`: sessions, drafts, view choices). */
export function forgetAccount(uid: string) {
  const next = readRememberedAccounts().filter((saved) => saved.uid !== uid);
  writeRememberedAccounts(next);
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.includes(`:${uid}`) || key.startsWith(`${uid}:`))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Nothing more this device can clear.
  }
  return next;
}
