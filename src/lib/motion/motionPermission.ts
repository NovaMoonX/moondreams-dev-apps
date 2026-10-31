const SHAKE_ON_KEY = 'moondreams-shake-on';

interface PermissionedMotionEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

const getPermissionApi = () =>
  typeof DeviceMotionEvent === 'undefined'
    ? null
    : (DeviceMotionEvent as unknown as PermissionedMotionEvent);

/** iPhones only let a page read motion after the person allows it from a tap; other devices need no permission. */
export function needsMotionPermission() {
  return typeof getPermissionApi()?.requestPermission === 'function';
}

const readStoredShakeOn = () => {
  try {
    return localStorage.getItem(SHAKE_ON_KEY);
  } catch {
    return null;
  }
};

/** Whether shake is on: never after the person turned it off, otherwise always where no permission exists, and on iPhones once allowed. */
export function isMotionAllowed() {
  const stored = readStoredShakeOn();
  return stored !== 'false' && (!needsMotionPermission() || stored === 'true');
}

/** Asks the device for motion access (call it from a tap) and remembers a yes. */
export async function requestMotionPermission() {
  const request = getPermissionApi()?.requestPermission;
  if (!request) return true;
  const isGranted = await request()
    .then((answer) => answer === 'granted')
    .catch(() => false);
  if (isGranted) {
    try {
      localStorage.setItem(SHAKE_ON_KEY, 'true');
    } catch {
      // The choice still holds until the page closes.
    }
  }
  return isGranted;
}

/** Turns shake on or off for this device; a no-op where storage is blocked. */
export function setShakeOn(isOn: boolean) {
  try {
    localStorage.setItem(SHAKE_ON_KEY, String(isOn));
  } catch {
    // The choice still holds until the page closes.
  }
}
