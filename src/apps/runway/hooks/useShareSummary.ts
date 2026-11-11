import { useEffect, useMemo, useRef } from 'react';

import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { db } from '@lib/firebase/config';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getRunwayEncryption,
  isKeptKey,
} from '@apps/runway/queries/runwayKeyQueries';
import { openJson, sealJson } from '@apps/runway/security';
import { selectIsAutoPayReady } from '@apps/runway/store/selectors/autoPaySelectors';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectBillsDueBeforePay } from '@apps/runway/store/selectors/overviewSelectors';
import {
  selectBillPayments,
  selectBills,
  selectComingDays,
  selectCostPaid,
  selectHorizonItems,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Sealed, ShareSummary } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

const LIST_LIMIT = 20;
const BILLS_WITHIN_DAYS = 30;
const DAY_MS = 86_400_000;
const WRITE_DELAY_MS = 2000;
const HOUR_MS = 3_600_000;
const FRESH_MS = 6 * HOUR_MS;
const CLEARED = 'cleared';

type SummaryFigures = Omit<ShareSummary, 'computedAt'>;

/** Keeps the sealed totals-and-names summary a connected app reads current on the plan; the plan opens without it when this never runs. */
export function useShareSummary(uid: string | null) {
  const now = useNow(60_000);
  const today = todayAsUtcDate(now);
  const hour = Math.floor(now / HOUR_MS);
  const isReady = useAppSelector(selectIsAutoPayReady);
  const currency = useAppSelector(
    (state) => state.runway.plan?.currencyCode ?? null,
  );
  const stance = useAppSelector(selectStance);
  const balances = useAppSelector(selectBalances);
  const costPaid = useAppSelector(selectCostPaid);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const dueBeforePay = useAppSelector((state) =>
    selectBillsDueBeforePay(state, today, 'want'),
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const horizon = useAppSelector((state) => selectHorizonItems(state, today));
  const networkStatus = useNetworkStatus();
  const { isScrambled } = useValuesHidden();
  const lastWritten = useRef<string | null>(null);
  const isOffline =
    networkStatus === 'offline' || networkStatus === 'reconnecting';

  const figures = useMemo((): SummaryFigures | null => {
    const free = getFreeToSpendFigure(balances);
    if (!isReady || currency === null || free.kind === 'unknown') return null;
    const through = today + BILLS_WITHIN_DAYS * DAY_MS;
    return {
      currency,
      freeToSpendCents: balances.freeToSpendCents,
      nextIncomeOn: comingDays[0] ? toDateInputValue(comingDays[0].on) : null,
      dueBeforeIncomeCents: dueBeforePay?.cents ?? 0,
      bills: bills
        .flatMap(({ item, version }) =>
          (payments[item.id] ?? [])
            .filter(
              ({ paid, dueOn }) =>
                paid === null && dueOn >= today && dueOn <= through,
            )
            .map(({ dueOn, totalCents }) => ({
              name: version.payload.name,
              amountCents: totalCents,
              dueOn,
            })),
        )
        .sort((a, b) => a.dueOn - b.dueOn || a.name.localeCompare(b.name))
        .slice(0, LIST_LIMIT)
        .map(({ name, amountCents, dueOn }) => ({
          name,
          amountCents,
          dueOn: toDateInputValue(dueOn),
        })),
      horizon: horizon.slice(0, LIST_LIMIT).map(({ item, version }) => {
        const status = getHorizonStatus(
          version.payload,
          balances.assignedByItem[item.id] ?? 0,
          today,
          stance,
          costPaid[item.id],
          balances.costPaidByItem[item.id] ?? 0,
          balances.costFromFreeByItem[item.id] ?? 0,
        );
        return {
          name: version.payload.name,
          targetCents: status.plannedCents,
          setAsideCents: status.figures.setAsideCents,
          targetOn: toDateInputValue(version.payload.happensOn) || null,
        };
      }),
    };
  }, [
    isReady,
    currency,
    today,
    stance,
    balances,
    costPaid,
    comingDays,
    dueBeforePay,
    bills,
    payments,
    horizon,
  ]);
  const isUnknown = useMemo(
    () =>
      isReady &&
      currency !== null &&
      getFreeToSpendFigure(balances).kind === 'unknown',
    [isReady, currency, balances],
  );
  const key = readWriteKey(isUnknown, figures);

  // The hour re-runs the freshness check, so a figure that stays the same is resealed every six hours.
  useEffect(() => {
    if (
      uid === null ||
      key === null ||
      isOffline ||
      isScrambled ||
      key === lastWritten.current
    )
      return;
    const run = { isCurrent: true };
    const write = async () => {
      try {
        const encryption = await getRunwayEncryption(uid);
        if (isKeptKey(encryption)) return;
        const planRef = doc(db, 'apps', 'runway', 'plans', uid);
        const stored: unknown = (await getDoc(planRef)).get('shareSummary');
        if (key === CLEARED) {
          if (typeof stored === 'object' && stored !== null && run.isCurrent) {
            await updateDoc(planRef, { shareSummary: null });
          }
          if (run.isCurrent) lastWritten.current = key;
          return;
        }
        const isFresh = await isStoredCurrent(stored, key, encryption);
        if (isFresh) {
          if (run.isCurrent) lastWritten.current = key;
          return;
        }
        const sealed = await sealJson(
          { ...(JSON.parse(key) as SummaryFigures), computedAt: Date.now() },
          encryption,
        );
        if (!run.isCurrent) return;
        await updateDoc(planRef, { shareSummary: sealed });
        lastWritten.current = key;
      } catch (error) {
        console.error('The shared summary was not written', error);
      }
    };
    const timer = setTimeout(() => void write(), WRITE_DELAY_MS);
    return () => {
      run.isCurrent = false;
      clearTimeout(timer);
    };
  }, [uid, key, isOffline, isScrambled, hour]);
}

const readWriteKey = (isUnknown: boolean, figures: SummaryFigures | null) => {
  if (isUnknown) return CLEARED;
  return figures === null ? null : JSON.stringify(figures);
};

/** Whether the stored summary already says these figures and is under six hours old. */
async function isStoredCurrent(
  stored: unknown,
  key: string,
  encryption: Parameters<typeof openJson>[1],
) {
  if (typeof stored !== 'object' || stored === null) return false;
  try {
    const { computedAt, ...figures } = await openJson<ShareSummary>(
      stored as Sealed,
      encryption,
    );
    return (
      JSON.stringify(figures) === key && Date.now() - computedAt < FRESH_MS
    );
  } catch {
    return false;
  }
}
