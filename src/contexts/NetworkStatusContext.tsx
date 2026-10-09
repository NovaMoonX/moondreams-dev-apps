import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  NetworkStatusContext,
  type NetworkBannerState,
} from '@hooks/useNetworkStatus';

type Phase = 'online' | 'offline' | 'reconnecting' | 'reconnected';

type Action =
  | { type: 'verifying' }
  | { type: 'verified' }
  | { type: 'verify-failed' }
  | { type: 'reconnected-timeout' };

function reducer(phase: Phase, action: Action): Phase {
  switch (action.type) {
    case 'verifying':
      // Only offline/reconnected phases route through verification — a
      // steady 'online' phase has nothing to re-verify.
      return phase === 'online' ? phase : 'reconnecting';
    case 'verified':
      return phase === 'online' ? phase : 'reconnected';
    case 'verify-failed':
      return 'offline';
    case 'reconnected-timeout':
      return phase === 'reconnected' ? 'online' : phase;
  }
}

const PROBE_TIMEOUT_MS = 5_000;
const OFFLINE_RETRY_INTERVAL_MS = 8_000;
const RECONNECTED_DISPLAY_MS = 3_000;

/** HEAD request to a same-origin resource — verifies the app can actually reach the network, not just that some interface is up (the browser's own 'online' event is unreliable, e.g. behind a captive portal). */
async function probeConnectivity(signal: AbortSignal): Promise<boolean> {
  try {
    await fetch(`/favicon.svg?probe=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal,
    });
    return true;
  } catch {
    return false;
  }
}

type NetworkInformationLike = EventTarget & { effectiveType?: string };

function getConnection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
}

export function NetworkStatusProvider({ children }: PropsWithChildren) {
  const [phase, dispatch] = useReducer(reducer, 'online');
  const [isSlow, setIsSlow] = useState(false);
  const probeTokenRef = useRef(0);

  const verifyConnection = useCallback((isSilent = false) => {
    const token = ++probeTokenRef.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    if (!isSilent) {
      dispatch({ type: 'verifying' });
    }

    probeConnectivity(controller.signal)
      .then((ok) => {
        if (token !== probeTokenRef.current) {
          return;
        }
        dispatch(ok ? { type: 'verified' } : { type: 'verify-failed' });
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  useEffect(() => {
    function handleOffline() {
      verifyConnection(true);
    }

    function handleOnline() {
      verifyConnection();
    }

    if (!navigator.onLine) {
      verifyConnection(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [verifyConnection]);

  // The browser's online flag can stay wrong (VPN or network switches, captive portals), so
  // keep re-probing while offline instead of waiting on it.
  useEffect(() => {
    if (phase !== 'offline') {
      return;
    }

    const interval = setInterval(() => verifyConnection(true), OFFLINE_RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, verifyConnection]);

  useEffect(() => {
    if (phase !== 'reconnected') {
      return;
    }

    const timeout = setTimeout(
      () => dispatch({ type: 'reconnected-timeout' }),
      RECONNECTED_DISPLAY_MS,
    );

    return () => clearTimeout(timeout);
  }, [phase]);

  // Network Information API is Chromium-only; `isSlow` just stays false elsewhere.
  useEffect(() => {
    const connection = getConnection();
    if (!connection) {
      return;
    }

    function update() {
      const effectiveType = connection?.effectiveType;
      setIsSlow(effectiveType === 'slow-2g' || effectiveType === '2g');
    }

    update();
    connection.addEventListener('change', update);
    return () => connection.removeEventListener('change', update);
  }, []);

  let status: NetworkBannerState = null;
  if (phase === 'offline') {
    status = 'offline';
  } else if (phase === 'reconnecting') {
    status = 'reconnecting';
  } else if (phase === 'reconnected') {
    status = 'reconnected';
  } else if (isSlow) {
    status = 'slow';
  }

  return (
    <NetworkStatusContext.Provider value={status}>
      {children}
    </NetworkStatusContext.Provider>
  );
}
