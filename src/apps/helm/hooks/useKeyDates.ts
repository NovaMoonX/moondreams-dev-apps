import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { nextYearlyOccurrence } from '@/utils/yearlyDateUtils';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import type { KeyDateKind } from '@apps/helm/types';

export interface WhoKeyDate {
  id: string;
  kind: KeyDateKind;
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
