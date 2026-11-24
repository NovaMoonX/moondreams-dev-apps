import { useEffect, useRef, useState } from 'react';

import { useAppSelector } from '@/store';
import { SPEND_WORDS, STORE_ORDER_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { isTrackingLevel } from '@apps/runway/engine/level';
import {
  findStoreOrder,
  isOpenStoreAction,
  planStoreAction,
  toOrderKey,
  type StoreAction,
} from '@apps/runway/engine/storeOrders';
import {
  recordDone,
  type DoneForYouInput,
} from '@apps/runway/hooks/useDoneForYou';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  applyStoreRefund,
  takeOffOrder,
} from '@apps/runway/store/actions/storeOrderActions';
import {
  selectEmailEvents,
  selectIsEmailEventsLoaded,
} from '@apps/runway/store/selectors/emailSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectEnvelopes,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenEmailEvent } from '@apps/runway/store/listeners/emailListeners';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import { toPurchaseSubject } from '@apps/runway/utils/doneForYouSubject';

const MAX_ATTEMPTS = 3;

interface Work {
  key: string;
  action: StoreAction;
  /** The refund's or cancellation's own purchase; null for a cancellation the email gave no amount for. */
  purchase: OpenPurchase | null;
}

/** Refunds and cancellations still to tie: open purchases, and whole-order cancellations with no amount that no order has logged. */
export function findStoreWork(
  all: readonly OpenPurchase[],
  events: readonly OpenEmailEvent[],
): Work[] {
  const logged = new Set(
    all.flatMap((purchase) =>
      (purchase.orderLog ?? []).flatMap((entry) =>
        entry.emailEventId === null ? [] : [entry.emailEventId],
      ),
    ),
  );
  const fromPurchases = all.filter(isOpenStoreAction).map((purchase): Work => ({
    key: `${purchase.id}:${purchase.updatedAt}`,
    purchase,
    action: {
      id: purchase.id,
      storeEmail: purchase.storeEmail as StoreAction['storeEmail'],
      merchant: purchase.merchant ?? purchase.label,
      date: purchase.date,
      amountCents: purchase.amountCents,
    },
  }));
  const fromEvents = events
    .filter(
      (event) =>
        event.outcome === 'cancel' &&
        event.purchaseId === null &&
        event.storeEmail?.isWholeOrder === true &&
        toOrderKey(event.storeEmail.orderNumber) !== null &&
        !logged.has(event.id),
    )
    .map((event): Work => ({
      key: `event:${event.id}`,
      purchase: null,
      action: {
        id: event.id,
        storeEmail: event.storeEmail as StoreAction['storeEmail'],
        merchant: event.storeEmail?.merchant ?? null,
        date: todayAsUtcDate(),
        amountCents: null,
      },
    }));
  return [...fromPurchases, ...fromEvents];
}

const describePlace = (
  lines: readonly PurchaseLine[],
  nameOf: (id: string) => string,
) => {
  const ids = [
    ...new Set(
      lines.flatMap((line) =>
        line.envelopeId === null ? [] : [line.envelopeId],
      ),
    ),
  ];
  if (ids.length === 0) return STORE_ORDER_WORDS.freeToSpend;
  if (ids.length === 1) return nameOf(ids[0]);
  return STORE_ORDER_WORDS.severalEnvelopes;
};

const whyOf = (action: StoreAction, store: string) =>
  action.storeEmail.orderNumber !== null
    ? STORE_ORDER_WORDS.refundWhyNumber(action.storeEmail.orderNumber)
    : STORE_ORDER_WORDS.refundWhyStore(store);

/** At Track and Link, ties each refund or cancellation from a store's email to its order on its own, each with a Done for you entry and Undo. */
export function useApplyStoreOrders(uid: string | null) {
  const level = useAppSelector(selectLevel);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const events = useAppSelector(selectEmailEvents);
  const looks = useAppSelector(selectItemLooks);
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const isReady = useAppSelector(
    (state) =>
      selectIsNeedsHomeLoaded(state) &&
      state.runway.purchasesFrom !== null &&
      selectIsPlanItemsLoaded(state) &&
      selectIsEmailEventsLoaded(state),
  );
  const tried = useRef(new Set<string>());
  const attempts = useRef(new Map<string, number>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);
  const latest = useRef({ looks, envelopes });

  useEffect(() => {
    latest.current = { looks, envelopes };
  });

  useEffect(() => {
    if (uid === null || !isReady || !isTrackingLevel(level)) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const all = [
      ...new Map(
        [...needsHome, ...purchases].map((purchase) => [purchase.id, purchase]),
      ).values(),
    ];
    const works = findStoreWork(all, events).filter(
      ({ key }) => !tried.current.has(key),
    );
    if (works.length === 0) return;
    works.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;

    const run = async () => {
      const { looks: names, envelopes: live } = latest.current;
      const liveIds = new Set(live.map(({ item }) => item.id));
      const nameOf = (id: string) => names.get(id)?.name ?? 'An envelope';
      try {
        const encryption = await getRunwayEncryption(uid);
        const { entries: done } = await works.reduce<
          Promise<{ entries: DoneForYouInput[]; all: OpenPurchase[] }>
        >(
          async (previous, work) => {
            const state = await previous;
            const { entries, all } = state;
            const replace = (...written: (OpenPurchase | null)[]) =>
              all.map(
                (purchase) =>
                  written.find((entry) => entry?.id === purchase.id) ??
                  purchase,
              );
            const order = findStoreOrder(work.action, all);
            if (order === null) return state;
            const plan = planStoreAction(work.action, order, all, (id) =>
              liveIds.has(id),
            );
            if (plan === null) return state;
            const store =
              order.merchant ?? work.action.merchant ?? STORE_ORDER_WORDS.store;
            try {
              if (plan.kind === 'takeOff') {
                const written = await takeOffOrder(
                  uid,
                  encryption,
                  order,
                  work.purchase,
                  {
                    amountCents: plan.amountCents,
                    lines: plan.lines,
                    entry: {
                      kind: 'cancel',
                      cents: plan.cents,
                      on: work.purchase?.date ?? todayAsUtcDate(),
                      emailEventId:
                        work.purchase?.emailEventId ??
                        (work.purchase === null ? work.action.id : null),
                      purchaseId: work.purchase?.id ?? null,
                      undoneAt: null,
                    },
                  },
                  STORE_ORDER_WORDS.cancelSummary(store),
                );
                return {
                  all: replace(written.order, written.cancel),
                  entries: [
                    ...entries,
                    {
                      kind: 'storeCancel',
                      title:
                        plan.amountCents === 0
                          ? STORE_ORDER_WORDS.cancelWhole(store)
                          : STORE_ORDER_WORDS.cancelTakenOff(store),
                      detail: null,
                      why: STORE_ORDER_WORDS.cancelWhy,
                      undo: {
                        kind: 'storeCancel',
                        written: written.order,
                        before: order,
                        cancel: written.cancel,
                        emailEventId:
                          written.order.orderLog?.at(-1)?.emailEventId ?? null,
                      },
                      subject: toPurchaseSubject(written.order),
                    } satisfies DoneForYouInput,
                  ],
                };
              }
              const lines = plan.kind === 'refund' ? plan.lines : null;
              const place =
                lines === null ? null : describePlace(lines, nameOf);
              const email = work.purchase as OpenPurchase;
              const bank =
                plan.bankId === null
                  ? null
                  : (all.find((entry) => entry.id === plan.bankId) ?? null);
              const applied = await applyStoreRefund(
                uid,
                encryption,
                bank ?? email,
                order.id,
                lines,
                STORE_ORDER_WORDS.refundSummary(
                  store,
                  place ?? STORE_ORDER_WORDS.freeToSpend,
                ),
                bank === null ? null : email,
              );
              const isCancel = work.action.storeEmail.kind === 'cancel';
              return {
                all: replace(
                  applied,
                  bank === null
                    ? null
                    : { ...email, lines: [], needsHome: false },
                ),
                entries: [
                  ...entries,
                  {
                    kind: 'storeRefund',
                    title:
                      place === null
                        ? STORE_ORDER_WORDS.refundTied(store)
                        : isCancel
                          ? STORE_ORDER_WORDS.cancelAfterCharge(store, place)
                          : STORE_ORDER_WORDS.refundApplied(store, place),
                    detail:
                      place === null ? STORE_ORDER_WORDS.refundTiedWhy : null,
                    why: whyOf(work.action, store),
                    undo: { kind: 'storeRefund', applied },
                    subject: toPurchaseSubject(applied),
                  } satisfies DoneForYouInput,
                ],
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              if (message !== SPEND_WORDS.changedElsewhere) {
                const count = (attempts.current.get(work.key) ?? 0) + 1;
                attempts.current.set(work.key, count);
                if (count < MAX_ATTEMPTS) tried.current.delete(work.key);
                console.error('A store email was not applied', error);
              }
              return state;
            }
          },
          Promise.resolve({ entries: [], all }),
        );
        recordDone(uid, done);
      } catch (error) {
        // The vault failed before anything was tried, so all of it may be tried again.
        works.forEach(({ key }) => tried.current.delete(key));
        console.error('Store emails were not applied', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [uid, level, needsHome, purchases, events, isReady, runs]);
}
