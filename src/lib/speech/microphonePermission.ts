type MicrophonePermission = PermissionState | 'unknown';

const watched = {
  state: 'unknown' as MicrophonePermission,
  isStarted: false,
  listeners: new Set<(state: MicrophonePermission) => void>(),
};

const setState = (state: MicrophonePermission) => {
  if (state === watched.state) return;
  watched.state = state;
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
    .catch(() => undefined);
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

export type MicrophoneRequestResult =
  'granted' | 'denied' | 'no-microphone' | 'unavailable';

/**
 * Asks for the microphone the standard way (`getUserMedia`) and releases it at once. This is the request a browser
 * and the phone record as this site's microphone permission; speech recognition alone can fail in an installed app
 * without ever asking, which leaves no microphone entry in its settings. Call it from a tap.
 */
/** Whether this page can ask for the microphone directly (a secure page in a browser with `getUserMedia`). */
export const canRequestMicrophone = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

export const requestMicrophone = async (): Promise<MicrophoneRequestResult> => {
  if (!canRequestMicrophone()) return 'unavailable';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    setState('granted');
    return 'granted';
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
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
  if (typeof navigator === 'undefined') return 'computer';
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
      'Close this app fully (swipe it up from the app switcher), open it again and tap Allow microphone.',
    ],
    'ios-browser': [
      'Tap the page menu (ᴀA or the page icon) beside the address bar, then Website Settings.',
      'Set Microphone to Ask or Allow.',
      'Come back and tap Try again.',
    ],
    'android-app': [
      'Open Chrome (the browser, not this app), tap ⋮ › Settings › Site settings › Microphone.',
      `Check “Use your microphone” is on, then under Blocked tap ${host} and choose Allow.`,
      'If Chrome itself has no microphone: phone Settings › Apps › Chrome › Permissions › Microphone › Allow.',
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
