/** What failed and the raw error from the place it was caught: never a token, a key or the person's text. */
export interface FallbackCause {
  /** The stage that failed, short and stable ("token request", "socket closed before open"). */
  stage: string;
  /** The error as the catch saw it: code, message, HTTP status, close code, or the limit that ran out. */
  detail: string;
}

export interface FallbackReport {
  /** A fixed constant per fallback, never built from data: dismissal and repeat-merging both go by it. */
  key: string;
  feature: string;
  wanted: string;
  used: string;
  reason: string;
  cause: FallbackCause;
  facts?: string[];
  trace?: string | null;
}

export interface Fallback {
  key: string;
  feature: string;
  wanted: string;
  used: string;
  reason: string;
  cause: FallbackCause;
  facts: string[];
  trace: string | null;
  count: number;
  firstAt: number;
  lastAt: number;
  recoveredAt: number | null;
  activeSince: number;
}

const DISMISSED_KEY = 'fallbacks:dismissed';

const toDismissId = (key: string, reason: string) =>
  JSON.stringify([key, reason]);

const readDismissed = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const kept: unknown = JSON.parse(
      window.sessionStorage.getItem(DISMISSED_KEY) ?? '[]',
    );
    return Array.isArray(kept)
      ? kept.filter((key) => typeof key === 'string')
      : [];
  } catch {
    return [];
  }
};

const store = {
  entries: new Map<string, Fallback>(),
  dismissed: new Set(readDismissed()),
  visible: [] as Fallback[],
  listeners: new Set<() => void>(),
};

const publish = () => {
  store.visible = Array.from(store.entries.values())
    .filter(
      (entry) => !store.dismissed.has(toDismissId(entry.key, entry.reason)),
    )
    .sort((a, b) => b.lastAt - a.lastAt);
  store.listeners.forEach((listener) => listener());
};

/** Notes that something preferred wasn't used and a stand-in was (a chosen voice, a downloaded model, a service, a cached copy), so debug viewers get a dismissible notice with Copy. Cheap and silent for everyone else. A fixed `key` per fallback keeps repeats on one entry, and the `cause` (the stage and the raw error) is required: say where it was caught, never a guess. */
export const reportFallback = (report: FallbackReport) => {
  if (
    import.meta.env?.DEV &&
    (report.cause.stage.trim() === '' || report.cause.detail.trim() === '')
  ) {
    console.warn(
      `Fallback ${report.key} was reported without its stage or its error`,
    );
  }
  const now = Date.now();
  const before = store.entries.get(report.key);
  const kept = before?.reason === report.reason ? before : undefined;
  store.entries.set(report.key, {
    key: report.key,
    feature: report.feature,
    wanted: report.wanted,
    used: report.used,
    reason: report.reason,
    cause: report.cause,
    facts: report.facts?.length ? report.facts : (kept?.facts ?? []),
    trace: report.trace ?? kept?.trace ?? null,
    count: (before?.count ?? 0) + 1,
    firstAt: before?.firstAt ?? now,
    lastAt: now,
    recoveredAt: null,
    activeSince:
      before === undefined ||
      before.recoveredAt !== null ||
      before.reason !== report.reason
        ? now
        : before.activeSince,
  });
  publish();
};

/** The preferred route works again: the entry stays, marked recovered, so a debug viewer can still read what failed; a later failure makes it active again and keeps counting. */
export const clearFallback = (key: string) => {
  const before = store.entries.get(key);
  if (before === undefined || before.recoveredAt !== null) return;
  store.entries.set(key, { ...before, recoveredAt: Date.now() });
  publish();
};

/** The person removed or turned off the preferred route, so there is nothing left to fall back from: the entry is deleted. */
export const removeFallback = (key: string) => {
  if (!store.entries.delete(key)) return;
  publish();
};

const keepDismissed = () => {
  try {
    window.sessionStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify(Array.from(store.dismissed)),
    );
  } catch {
    // Kept for this page only, so a reload shows it again.
  }
};

/** Hides this cause of this key for the rest of the session (the tab); a different cause under the same key shows again. */
export const dismissFallback = (key: string, reason: string) => {
  store.dismissed.add(toDismissId(key, reason));
  keepDismissed();
  publish();
};

/** Drops every report and every dismissal, so a check starts from nothing. */
export const resetFallbacks = () => {
  store.entries.clear();
  store.dismissed.clear();
  keepDismissed();
  publish();
};

export const subscribeFallbacks = (listener: () => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

/** The fallbacks in play and not dismissed, newest first; the same array until something changes. */
export const readFallbacks = () => store.visible;
