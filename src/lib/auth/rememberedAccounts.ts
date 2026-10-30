const STORAGE_KEY = 'remembered-accounts';

/** An account used on this device, kept so the avatar menu can offer a switch; profile details only, never a credential. */
export interface RememberedAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastUsedAt: number;
}

function isRememberedAccount(value: unknown): value is RememberedAccount {
  return typeof value === 'object' && value !== null && typeof (value as RememberedAccount).uid === 'string';
}

export function readRememberedAccounts(): RememberedAccount[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isRememberedAccount).sort((left, right) => right.lastUsedAt - left.lastUsedAt)
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

/** Puts this account first in the device's list, refreshing its name and photo. */
export function rememberAccount(account: Omit<RememberedAccount, 'lastUsedAt'>) {
  const others = readRememberedAccounts().filter((saved) => saved.uid !== account.uid);
  const next = [{ ...account, lastUsedAt: Date.now() }, ...others];
  writeRememberedAccounts(next);
  return next;
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
