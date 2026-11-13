const NOTE_KEY = 'signOut:landingNote';

/** What the signed-out home says once after a sign-out that did more than leave this browser. */
export const SIGNED_OUT_EVERYWHERE_NOTE =
  'You’re signed out everywhere. Sign in again on the devices you still have.';

export function keepSignOutNote(note: string) {
  try {
    window.sessionStorage.setItem(NOTE_KEY, note);
  } catch {
    return;
  }
}

export function readSignOutNote() {
  try {
    return window.sessionStorage.getItem(NOTE_KEY);
  } catch {
    return null;
  }
}

export function clearSignOutNote() {
  try {
    window.sessionStorage.removeItem(NOTE_KEY);
  } catch {
    return;
  }
}
