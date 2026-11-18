export type SignOutQuestion = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

const MARKER_PREFIX = 'pending-device-work:';

const markerKey = (uid: string, key: string) => `${MARKER_PREFIX}${uid}:${key}`;

const isQuestion = (value: unknown): value is SignOutQuestion => {
  const question = value as Partial<SignOutQuestion> | null;
  return (
    typeof question === 'object' &&
    question !== null &&
    typeof question.title === 'string' &&
    typeof question.message === 'string' &&
    typeof question.confirmText === 'string' &&
    typeof question.cancelText === 'string'
  );
};

/** Notes that something kept only on this device is still unsent, holding the question to ask (never the work itself) so sign-out asks even where the feature never loaded; `null` clears it. */
export function setPendingDeviceWork(
  uid: string,
  key: string,
  pending: { question: SignOutQuestion; count: number } | null,
) {
  try {
    if (pending === null || pending.count <= 0) {
      window.localStorage.removeItem(markerKey(uid, key));
      return;
    }
    window.localStorage.setItem(markerKey(uid, key), JSON.stringify(pending));
  } catch {
    // Storage may be unavailable; the question is then only a courtesy lost.
  }
}

/** Forgets every marker kept for the person, once what they pointed at is gone. */
export function clearPendingDeviceWork(uid: string) {
  try {
    Object.keys(window.localStorage)
      .filter((name) => name.startsWith(`${MARKER_PREFIX}${uid}:`))
      .forEach((name) => window.localStorage.removeItem(name));
  } catch {
    // Nothing to clear when storage can't be read.
  }
}

/** How many unsent things this device holds for the person, summed over every kind of work that left a marker. */
export function getPendingDeviceWorkCount(uid: string) {
  try {
    const prefix = `${MARKER_PREFIX}${uid}:`;
    return Object.keys(window.localStorage)
      .filter((name) => name.startsWith(prefix))
      .reduce((sum, name) => {
        try {
          const stored = JSON.parse(window.localStorage.getItem(name) ?? '');
          const count = (stored as { count?: unknown } | null)?.count;
          return sum + (typeof count === 'number' ? count : 0);
        } catch {
          return sum;
        }
      }, 0);
  } catch {
    return 0;
  }
}

/** What to ask the person before this account signs out, one question per kind of unsent work. */
export function getSignOutQuestions(uid: string) {
  try {
    const prefix = `${MARKER_PREFIX}${uid}:`;
    const questions = Object.keys(window.localStorage)
      .filter((name) => name.startsWith(prefix))
      .flatMap((name) => {
        try {
          const stored = JSON.parse(window.localStorage.getItem(name) ?? '');
          const question = (stored as { question?: unknown } | null)?.question;
          return isQuestion(question) ? [[name, question] as const] : [];
        } catch {
          return [];
        }
      });
    return Array.from(new Map(questions).values());
  } catch {
    return [];
  }
}
