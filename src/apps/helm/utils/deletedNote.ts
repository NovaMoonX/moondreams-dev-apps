const NOTE_KEY = 'helm:deletedNote';

/** Keeps a one-time line for the first open after a delete, in this tab only. */
export function keepDeletedNote() {
  try {
    window.sessionStorage.setItem(NOTE_KEY, '1');
  } catch {
    return;
  }
}

export function readDeletedNote() {
  try {
    return window.sessionStorage.getItem(NOTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDeletedNote() {
  try {
    window.sessionStorage.removeItem(NOTE_KEY);
  } catch {
    return;
  }
}
