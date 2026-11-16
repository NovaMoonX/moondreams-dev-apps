export interface FallbackReport {
  /** A fixed string for one fallback ("speech:cloud-voice"), never built from data: the same key reported again updates its entry instead of adding one. */
  key: string;
  /** The capability that fell back, in a word or two ("Speaking"). */
  feature: string;
  /** What was meant to be used ("Your chosen voice"). */
  wanted: string;
  /** What stood in ("This device's voice"). */
  used: string;
  /** Why the preferred one wasn't used, in the failure's own words. */
  reason: string;
  /** Short facts read beside the failure, one per line. */
  facts?: string[];
  /** A long trace, folded in the details. */
  trace?: string | null;
}

export interface Fallback {
  key: string;
  feature: string;
  wanted: string;
  used: string;
  reason: string;
  facts: string[];
  trace: string | null;
  count: number;
  firstAt: number;
  lastAt: number;
}

const DISMISSED_KEY = 'fallbacks:dismissed';

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
    .filter((entry) => !store.dismissed.has(entry.key))
    .sort((a, b) => b.lastAt - a.lastAt);
  store.listeners.forEach((listener) => listener());
};

/** Notes that something preferred wasn't used and a stand-in was (a chosen voice, a downloaded model, a service, a cached copy), so debug viewers get a dismissible notice with Copy. Cheap and silent for everyone else. */
export const reportFallback = (report: FallbackReport) => {
  const now = Date.now();
  const before = store.entries.get(report.key);
  store.entries.set(report.key, {
    key: report.key,
    feature: report.feature,
    wanted: report.wanted,
    used: report.used,
    reason: report.reason,
    facts: report.facts ?? [],
    trace: report.trace ?? null,
    count: (before?.count ?? 0) + 1,
    firstAt: before?.firstAt ?? now,
    lastAt: now,
  });
  publish();
};

/** The preferred route works again: its notice goes away, and a later failure starts a fresh count. */
export const clearFallback = (key: string) => {
  if (!store.entries.delete(key)) return;
  publish();
};

/** Hides this key for the rest of the session (the tab), even if it fails again. */
export const dismissFallback = (key: string) => {
  store.dismissed.add(key);
  try {
    window.sessionStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify(Array.from(store.dismissed)),
    );
  } catch {
    // Kept for this page only, so a reload shows it again.
  }
  publish();
};

/** Drops every report and every dismissal, so a check starts from nothing. */
export const resetFallbacks = () => {
  store.entries.clear();
  store.dismissed.clear();
  try {
    window.sessionStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing kept to remove.
  }
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
