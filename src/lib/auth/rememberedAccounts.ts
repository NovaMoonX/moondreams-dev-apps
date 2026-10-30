const STORAGE_KEY = 'remembered-accounts';
const CACHED_PHOTO_SIZE = 96;

/** An account used on this device, kept so the avatar menu can offer a switch; profile details only, never a credential. */
export interface RememberedAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** A small copy of `photoURL` saved on this device, so the photo still shows once that account is signed out. */
  cachedPhoto: { sourceURL: string; dataURL: string } | null;
  lastUsedAt: number;
}

function isRememberedAccount(value: unknown): value is RememberedAccount {
  return typeof value === 'object' && value !== null && typeof (value as RememberedAccount).uid === 'string';
}

const withCachedPhoto = (account: RememberedAccount): RememberedAccount => ({
  ...account,
  cachedPhoto: account.cachedPhoto ?? null,
});

export function readRememberedAccounts(): RememberedAccount[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
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
  } catch {
    // Without storage the menu just offers no other accounts.
  }
}

/** The photo to draw for a remembered account: the saved copy when it matches the current photo, else the photo's own URL. */
export function getRememberedPhoto(account: RememberedAccount) {
  return account.cachedPhoto && account.cachedPhoto.sourceURL === account.photoURL
    ? account.cachedPhoto.dataURL
    : account.photoURL;
}

/** Puts this account first in the device's list, refreshing its name and photo. */
export function rememberAccount(account: Omit<RememberedAccount, 'lastUsedAt' | 'cachedPhoto'>) {
  const saved = readRememberedAccounts();
  const previous = saved.find((entry) => entry.uid === account.uid);
  const others = saved.filter((entry) => entry.uid !== account.uid);
  const next = [
    { ...account, cachedPhoto: previous?.cachedPhoto ?? null, lastUsedAt: Date.now() },
    ...others,
  ];
  writeRememberedAccounts(next);
  return next;
}

async function readPhotoAsDataURL(url: string) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Photo request failed: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, CACHED_PHOTO_SIZE / Math.min(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Saves a small copy of the account's photo on this device when it has none for that photo yet; returns the new list, or `null` when nothing changed. */
export async function cacheRememberedPhoto(uid: string) {
  const account = readRememberedAccounts().find((entry) => entry.uid === uid);
  const sourceURL = account?.photoURL;
  if (!sourceURL || account.cachedPhoto?.sourceURL === sourceURL) return null;
  try {
    const dataURL = await readPhotoAsDataURL(sourceURL);
    const next = readRememberedAccounts().map((entry) =>
      entry.uid === uid && entry.photoURL === sourceURL
        ? { ...entry, cachedPhoto: { sourceURL, dataURL } }
        : entry,
    );
    writeRememberedAccounts(next);
    return next;
  } catch {
    // A photo host that refuses cross-origin reads keeps showing its live URL.
    return null;
  }
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
