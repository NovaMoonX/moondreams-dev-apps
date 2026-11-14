import { describeThrown, recordSpeechEvent } from './speechDiagnostics';

type MicrophonePermission = PermissionState | 'unknown';

const watched = {
  state: 'unknown' as MicrophonePermission,
  isStarted: false,
  wasGranted: false,
  listeners: new Set<(state: MicrophonePermission) => void>(),
};

const REFUSED_KEY = 'speech:recognition-refused';

/** Remembers on this device that recognition was refused before the microphone was ever allowed (an installed app can refuse without prompting). Cleared once the permission reads granted. */
export const rememberRecognitionRefused = () => {
  if (watched.wasGranted) return;
  try {
    window.localStorage.setItem(REFUSED_KEY, 'true');
  } catch {
    // Without storage the refusal is found again on the next tap.
  }
};

const forgetRecognitionRefused = () => {
  try {
    window.localStorage.removeItem(REFUSED_KEY);
  } catch {
    // Storage is unavailable, so nothing was kept.
  }
};

const wasRecognitionRefused = () => {
  try {
    return window.localStorage.getItem(REFUSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const setState = (state: MicrophonePermission) => {
  if (state === 'granted') {
    watched.wasGranted = true;
    forgetRecognitionRefused();
  }
  if (state === watched.state) return;
  watched.state = state;
  recordSpeechEvent(`Microphone permission: ${state}`);
  watched.listeners.forEach((listener) => listener(state));
};

const queryMicrophone = async () =>
  navigator.permissions.query({ name: 'microphone' as PermissionName });

const startWatching = () => {
  if (watched.isStarted || typeof navigator === 'undefined') return;
  watched.isStarted = true;
  queryMicrophone()
    .then((status) => {
      setState(status.state);
      status.addEventListener('change', () => setState(status.state));
    })
    .catch(() => {
      watched.isStarted = false;
    });
};

/** Whether the browser already holds the microphone permission for this site: 'granted' only when it says so, 'unknown' where it cannot tell. Never asks. */
export const readMicrophonePermission =
  async (): Promise<MicrophonePermission> => {
    startWatching();
    try {
      const status = await queryMicrophone();
      setState(status.state);
      return status.state;
    } catch {
      return 'unknown';
    }
  };

/** The last microphone permission the browser reported, read without waiting, so a tap can decide at once; 'unknown' until it has answered. */
export const peekMicrophonePermission = (): MicrophonePermission => {
  startWatching();
  return watched.state;
};

/** Calls `onChange` whenever the browser reports a new microphone permission for this site (granted in its settings, revoked, reset); returns the unsubscribe. */
export const watchMicrophonePermission = (
  onChange: (state: MicrophonePermission) => void,
) => {
  startWatching();
  watched.listeners.add(onChange);
  return () => {
    watched.listeners.delete(onChange);
  };
};

/** Whether the microphone was allowed at some point in this visit, so a later refusal of recognition is about the speech service (Siri or Dictation off), not the microphone. */
export const wasMicrophoneGranted = () => watched.wasGranted;

/** Whether listening should not start from a tap: the microphone is refused, or it hasn't been asked for on a device where recognition was refused without asking. The way in is `requestMicrophone`. */
export const needsMicrophoneAsk = (state: MicrophonePermission) =>
  state === 'denied' || (state === 'prompt' && wasRecognitionRefused());

export type MicrophoneRequestResult =
  'granted' | 'denied' | 'system-denied' | 'no-microphone' | 'unavailable';

const isChromium = () =>
  typeof navigator !== 'undefined' &&
  /Chrome\//.test(navigator.userAgent) &&
  !/iPad|iPhone|iPod/.test(navigator.userAgent);

const readsPrompt = async () => {
  try {
    return (await queryMicrophone()).state === 'prompt';
  } catch {
    return false;
  }
};

/** Whether this page can ask for the microphone directly (a secure page in a browser with `getUserMedia`). */
export const canRequestMicrophone = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

/**
 * Asks for the microphone the standard way (`getUserMedia`) and releases it at once. This is the request a browser
 * and the phone record as this site's microphone permission; speech recognition alone can fail in an installed app
 * without ever asking, which leaves no microphone entry in its settings. Call it from a tap.
 */
export const requestMicrophone = async (): Promise<MicrophoneRequestResult> => {
  if (!canRequestMicrophone()) return 'unavailable';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    recordSpeechEvent('getUserMedia: allowed');
    setState('granted');
    return 'granted';
  } catch (error) {
    recordSpeechEvent(`getUserMedia refused: ${describeThrown(error)}`);
    const name = error instanceof DOMException ? error.name : '';
    // In Chromium a refusal that leaves the site at "prompt" without being dismissed came from the device keeping the microphone from the browser.
    if (
      name === 'NotAllowedError' &&
      isChromium() &&
      !/dismiss/i.test(error instanceof Error ? error.message : '') &&
      (await readsPrompt())
    ) {
      setState('prompt');
      return 'system-denied';
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      setState('denied');
      return 'denied';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      return 'no-microphone';
    return 'unavailable';
  }
};

export type MicrophoneDevice =
  'ios-app' | 'ios-browser' | 'android-app' | 'android-browser' | 'computer';

/** Which kind of device and window this page runs in, for how to unblock the microphone there. */
export const detectMicrophoneDevice = (): MicrophoneDevice => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined')
    return 'computer';
  const agent = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(agent);
  const isInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isIOS) return isInstalled ? 'ios-app' : 'ios-browser';
  if (isAndroid) return isInstalled ? 'android-app' : 'android-browser';
  return 'computer';
};

/** How to let this site use the microphone again once it is blocked, for the device it runs on. */
export const getMicrophoneHowTo = (
  device: MicrophoneDevice,
  host: string,
): string[] => {
  const howTo: Record<MicrophoneDevice, string[]> = {
    'ios-app': [
      'Open the Settings app, then Apps › Safari (on older iPhones, just Safari).',
      'Under Settings for Websites, tap Microphone and choose Ask or Allow.',
      'Close this app fully (swipe it up from the app switcher), open it again and tap Try again.',
      'Still blocked? Remove this app from the Home Screen and add it again from Safari.',
    ],
    'ios-browser': [
      'Tap the page menu (ᴀA or the page icon) beside the address bar, then Website Settings.',
      'Set Microphone to Ask or Allow.',
      'Come back and tap Try again.',
    ],
    'android-app': [
      `Open Chrome, tap ⋮ › Settings › Site settings › Microphone, find ${host} and choose Allow.`,
      'Not listed? Your phone may be keeping the microphone from Chrome: open your phone’s Settings › Apps › Chrome › Permissions › Microphone and choose Allow.',
      'Come back and tap Try again.',
    ],
    'android-browser': [
      'Tap the icon left of the address bar, then Permissions (or Site settings).',
      'Set Microphone to Allow.',
      'Come back and tap Try again.',
    ],
    computer: [
      'Click the icon left of the address bar.',
      `Set Microphone to Allow for ${host}.`,
      'Come back and click Try again.',
    ],
  };
  return howTo[device];
};

/** How to let the browser itself use the microphone when the phone or computer keeps it from the browser (the site's own setting is not the problem). */
export const getSystemMicrophoneHowTo = (
  device: MicrophoneDevice,
): string[] => {
  if (device === 'android-app' || device === 'android-browser')
    return [
      'Open your phone’s Settings › Apps › Chrome (or the browser you installed this app from) › Permissions › Microphone and choose Allow.',
      'If your phone has a Microphone access tile in Quick Settings, make sure it’s on.',
      `Already allowed? In your browser, tap ⋮ › Settings › Site settings › Microphone, find ${window.location.host} and choose Allow.`,
      'Come back and tap Try again.',
    ];
  if (device === 'computer')
    return [
      'Open your computer’s privacy settings (on a Mac, System Settings › Privacy & Security › Microphone) and turn the microphone on for your browser.',
      `Already on? Click the icon left of the address bar and set Microphone to Allow for ${window.location.host}.`,
      'Quit and reopen the browser, then click Try again.',
    ];
  return getMicrophoneHowTo(device, window.location.host);
};
