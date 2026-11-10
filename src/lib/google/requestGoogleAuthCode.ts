const MESSAGE_TYPE = 'google-auth-return';
const STATE_KEY = 'google-auth-state';
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 650;
const POLL_MS = 400;
const CLOSED_GRACE_MS = 600;

export type GoogleAuthResult =
  { code: string; state: string } | 'redirected' | 'cancelled';

export type GoogleAuthReturn =
  { code: string; state: string } | { error: string };

interface GoogleAuthMessage {
  type: typeof MESSAGE_TYPE;
  code: string | null;
  state: string | null;
  error: string | null;
}

const isMessage = (data: unknown): data is GoogleAuthMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === MESSAGE_TYPE;

/** Reads what Google put in a page's query when it sent the person back: a code and its state, an error, or nothing. */
export function readGoogleAuthReturn(search: string): GoogleAuthReturn | null {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) return { error };
  const code = params.get('code');
  const state = params.get('state');
  return code && state ? { code, state } : null;
}

/** Asks Google for consent in a popup, or in this tab when the popup is blocked. Browser sign-in only. */
export function requestGoogleAuthCode({
  authUrl,
  state,
}: {
  authUrl: string;
  state: string;
}): Promise<GoogleAuthResult> {
  const left = Math.max(
    0,
    window.screenX + (window.outerWidth - POPUP_WIDTH) / 2,
  );
  const top = Math.max(
    0,
    window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2,
  );
  const popup = window.open(
    authUrl,
    'google-auth',
    `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
  );

  if (!popup) {
    try {
      sessionStorage.setItem(STATE_KEY, state);
    } catch {
      // Private browsing can refuse storage; the sign-in still works without it.
    }
    window.location.assign(authUrl);
    return Promise.resolve('redirected');
  }

  return new Promise((resolve) => {
    const flag = { isDone: false };
    const settle = (result: GoogleAuthResult) => {
      if (flag.isDone) return;
      flag.isDone = true;
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isMessage(event.data))
        return;
      const { code, state: returnedState, error } = event.data;
      if (error || !code || !returnedState) return settle('cancelled');
      if (returnedState !== state) return;
      settle({ code, state: returnedState });
    }

    // The popup posts its message just before it closes, so a closed popup gets a moment for the message to land.
    const timer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(timer);
      window.setTimeout(() => settle('cancelled'), CLOSED_GRACE_MS);
    }, POLL_MS);
    window.addEventListener('message', onMessage);
  });
}

/** On the page Google sends the person back to: when this is the popup, hands the result to the page that opened it and closes, returning true; otherwise false and the page finishes the flow itself. */
export function handOffGoogleAuthReturn(): boolean {
  const opener = window.opener as Window | null;
  if (!opener || opener === window) return false;
  try {
    if (opener.location.origin !== window.location.origin) return false;
    const returned = readGoogleAuthReturn(window.location.search);
    const message: GoogleAuthMessage = {
      type: MESSAGE_TYPE,
      code: returned && 'code' in returned ? returned.code : null,
      state: returned && 'state' in returned ? returned.state : null,
      error: returned && 'error' in returned ? returned.error : null,
    };
    opener.postMessage(message, window.location.origin);
    window.close();
    return true;
  } catch {
    return false;
  }
}
