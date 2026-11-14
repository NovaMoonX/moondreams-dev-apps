const KEPT = 12;

const log = { lines: [] as string[] };

/** Notes something the browser said about listening (an error's raw code and message, a permission change), kept for the debug details on a phone with no console. */
export const recordSpeechEvent = (text: string) => {
  const time = new Date().toISOString().slice(11, 19);
  log.lines = [...log.lines, `${time} ${text}`].slice(-KEPT);
};

/** The last few things the browser said about listening, oldest first. */
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
