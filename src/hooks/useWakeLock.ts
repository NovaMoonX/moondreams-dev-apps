import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';

const getIsSupported = () =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** Asks the browser to keep the screen on while `isActive`, and again each time the page comes back to the front, since a browser lets go of it when the page is hidden. Needs a secure page; a refusal is logged and never thrown. */
export function useWakeLock(isActive: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const isActiveRef = useRef(isActive);
  const isAskingRef = useRef(false);
  const [isHeld, setIsHeld] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const isSupported = getIsSupported();

  const acquire = useCallback(() => {
    const held = sentinelRef.current;
    if (
      !getIsSupported() ||
      !isActiveRef.current ||
      (held !== null && !held.released) ||
      isAskingRef.current
    ) {
      return;
    }

    isAskingRef.current = true;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (!isActiveRef.current) {
          sentinel.release().catch((error: unknown) => {
            console.error('The screen lock could not be released', error);
          });
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current !== sentinel) {
            return;
          }
          sentinelRef.current = null;
          setIsHeld(false);
        });
        setHasFailed(false);
        setIsHeld(true);
      })
      .catch((error: unknown) => {
        console.error('The screen could not be kept awake', error);
        setHasFailed(true);
      })
      .finally(() => {
        isAskingRef.current = false;
      });
  }, []);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) {
      return;
    }

    acquire();
    return () => {
      isActiveRef.current = false;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setIsHeld(false);
      sentinel?.release().catch((error: unknown) => {
        console.error('The screen lock could not be released', error);
      });
    };
  }, [isActive, acquire]);

  useOnTabReturn(acquire);

  return { isSupported, isHeld: isActive && isHeld, hasFailed };
}

export default useWakeLock;
