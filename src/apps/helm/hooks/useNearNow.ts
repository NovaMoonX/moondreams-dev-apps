import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import {
  distanceKm,
  NEARBY_KM,
  nearestKnownCity,
  readNearNow,
} from '@apps/helm/engine/whereabouts';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { setWhoNearNow } from '@apps/helm/store/actions/whoActions';
import type { NearNow } from '@apps/helm/types';
import { readPosition, roundTo3 } from '@apps/helm/utils/phoneLocation';
import { toKnownCities } from '@apps/helm/utils/whereInputs';

const HOUR_MS = 60 * 60 * 1000;
const CHECK_MS = 10 * 60 * 1000;

/** While the phone location is on and the page is showing, reads the phone's position at most once an hour and keeps the nearest known city (and, at Precise, the point) on the self. Coordinates go nowhere else. */
export function useNearNow(isEnabled: boolean) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const level = useAppSelector((state) => state.helm.profile?.phoneLocation);
  const selfWhoId = useAppSelector((state) => state.helm.profile?.selfWhoId);
  const readAt = useAppSelector(
    (state) =>
      state.helm.who.items.find((entry) => entry.isSelf && !entry.isUnreadable)
        ?.nearNow?.at ?? null,
  );
  const lastAttempt = useRef(0);
  const isRunning = useRef(false);
  const isVisible = document.visibilityState === 'visible';
  const isDue =
    isEnabled &&
    isVisible &&
    user !== null &&
    !!selfWhoId &&
    !!level &&
    level !== 'off' &&
    now - (readAt ?? 0) >= HOUR_MS;
  const checkBucket = Math.floor(now / CHECK_MS);

  useEffect(() => {
    if (!isDue || !user || !selfWhoId || !level) return;
    if (isRunning.current || Date.now() - lastAttempt.current < HOUR_MS) return;
    isRunning.current = true;
    lastAttempt.current = Date.now();
    const run = async () => {
      const encryption = await getHelmEncryption(user.uid);
      const self = () =>
        store.getState().helm.who.items.find((entry) => entry.id === selfWhoId);
      const found = await readPosition(level).then(
        (point) => point,
        () => null,
      );
      const people = store.getState().helm.who.items;
      const home = self()?.home ?? null;
      const city = !found
        ? null
        : (nearestKnownCity(found, toKnownCities(people))?.name ??
          (home && distanceKm(found, home) > NEARBY_KM
            ? 'away from home'
            : null));
      if (found && city) {
        const reading: NearNow = {
          city,
          at: Date.now(),
          point:
            level === 'precise'
              ? {
                  lat: roundTo3(found.latitude),
                  lng: roundTo3(found.longitude),
                }
              : null,
        };
        await setWhoNearNow(user.uid, encryption, selfWhoId, reading);
        return;
      }
      const current = self()?.nearNow ?? null;
      if (current && !readNearNow(current, Date.now())) {
        await setWhoNearNow(user.uid, encryption, selfWhoId, null);
      }
    };
    void run()
      .catch((error: unknown) => {
        console.error('Helm phone location was not read', error);
      })
      .finally(() => {
        isRunning.current = false;
      });
  }, [isDue, checkBucket, user, selfWhoId, level]);
}
