import { useEffect, useMemo, useState } from 'react';

import { createSealedReader } from '@lib/security';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { nextYearlyOccurrence } from '@/utils/yearlyDateUtils';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { startMomentsListener } from '@apps/helm/store/listeners/momentListener';
import { sortMoments, type WhoMoment } from '@apps/helm/utils/moments';

export interface WhoKeyDate {
  id: string;
  kind: 'birthday' | 'anniversary' | 'custom';
  label: string | null;
  month: number;
  day: number | null;
  year: number | null;
  /** The day it next falls on; null while the day is not known. */
  occurrence: string | null;
}

/** A who's dates that come back, read from the index, soonest next day first; one with no day comes last, by month. */
export function useKeyDates(whoId: string) {
  const todayKey = useTodayKey();
  const entries = useAppSelector(
    (state) => state.helm.keyDateIndex.byWho[whoId],
  );
  const isLoaded = useAppSelector((state) => state.helm.keyDateIndex.isLoaded);
  const dates = useMemo(
    () =>
      (entries ?? [])
        .map(([id, kind, month, day, year, label]): WhoKeyDate => ({
          id,
          kind,
          label,
          month,
          day,
          year,
          occurrence:
            day === null
              ? null
              : nextYearlyOccurrence({ month, day }, todayKey),
        }))
        .sort((a, b) =>
          a.occurrence !== null && b.occurrence !== null
            ? a.occurrence.localeCompare(b.occurrence)
            : a.occurrence !== null
              ? -1
              : b.occurrence !== null
                ? 1
                : a.month - b.month,
        ),
    [entries, todayKey],
  );
  return { dates, isLoaded };
}

/** A who's moments, read while a page that needs them is open: one listener for the who, opened and sorted newest first on the device. Nothing is read while `isEnabled` is false. */
export function useMoments(whoId: string, isEnabled = true) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<{
    whoId: string;
    moments: WhoMoment[] | null;
    hasFailed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!uid || !isEnabled) return;
    let stop: (() => void) | null = null;
    let isCurrent = true;
    getHelmEncryption(uid)
      .then((encryption) => {
        if (!isCurrent) return;
        stop = startMomentsListener(
          uid,
          whoId,
          createSealedReader(encryption, openJson),
          (moments) =>
            setState({
              whoId,
              moments: sortMoments(moments),
              hasFailed: false,
            }),
          (error) => {
            console.error('Helm moments did not open', error);
            setState({ whoId, moments: null, hasFailed: true });
          },
        );
      })
      .catch((error: unknown) => {
        console.error('Helm moments did not open', error);
        if (isCurrent) setState({ whoId, moments: null, hasFailed: true });
      });
    return () => {
      isCurrent = false;
      stop?.();
    };
  }, [uid, whoId, isEnabled]);

  const current = state?.whoId === whoId ? state : null;
  return {
    moments: current?.moments ?? [],
    isLoaded: current?.moments != null,
    hasFailed: current?.hasFailed ?? false,
  };
}
