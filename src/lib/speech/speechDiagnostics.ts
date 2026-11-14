const KEPT = 12;

const KEY = 'speech:events';

const readKept = () => {
  try {
    const kept: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((line) => typeof line === 'string') : [];
  } catch {
    return [];
  }
};

const log = {
  lines: typeof window === 'undefined' ? [] : readKept(),
  listeners: new Set<() => void>(),
};

/** Notes something the browser said about listening (an error's raw code and message, a permission change), kept for the debug details on a phone with no console. */
export const recordSpeechEvent = (text: string) => {
  const time = new Date().toISOString().slice(11, 19);
  log.lines = [...log.lines, `${time} ${text}`].slice(-KEPT);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(log.lines));
  } catch {
    // Kept for this page only, so a reload loses it.
  }
  log.listeners.forEach((listener) => listener());
};

/** Calls back whenever a speech event is recorded, for `useSyncExternalStore`. */
export const subscribeSpeechEvents = (listener: () => void) => {
  log.listeners.add(listener);
  return () => {
    log.listeners.delete(listener);
  };
};

/** The last few things the browser said about listening in this tab, oldest first, kept across a reload. */
export const readSpeechEvents = () => log.lines;

/** A thrown value in its own words: the DOMException name and message, or the text. */
export const describeThrown = (error: unknown) =>
  error instanceof Error
    ? `${error.name}: ${error.message || '(no message)'}`
    : String(error);

/** What this browser offers for listening, one fact per line. */
export const describeSpeechSetup = (): string[] => {
  if (typeof window === 'undefined') return [];
  const speechWindow = window as Window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const isInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return [
    `Installed app: ${isInstalled ? 'yes' : 'no'}`,
    `Secure page: ${window.isSecureContext ? 'yes' : 'no'}`,
    `getUserMedia: ${typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'yes' : 'no'}`,
    `Speech recognition: ${speechWindow.SpeechRecognition ? 'standard' : speechWindow.webkitSpeechRecognition ? 'webkit' : 'none'}`,
    `Online: ${navigator.onLine ? 'yes' : 'no'}`,
    `Browser: ${navigator.userAgent}`,
  ];
};
