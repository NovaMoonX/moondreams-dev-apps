import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { AUTO_PAY_WORDS } from '@apps/runway/constants';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import {
  findAutoChecks,
  findAutoMarks,
  findChargeMatches,
  getMatchedKeys,
  getPaymentKey,
  rankChargeCandidates,
  type AutoCheck,
  type AutoMark,
  type ChargeMatch,
} from '@apps/runway/engine/autoPay';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { countMarks, type PaidPayment } from '@apps/runway/engine/progress';
import { inTurn } from '@apps/runway/hooks/paidQueue';
import { getHeldFor } from '@apps/runway/hooks/useBillPaid';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  correctPaidAmount,
  forgetBillMatch,
  matchChargeToBill,
  undoChargeMatch,
  type ChargeMatchResult,
} from '@apps/runway/store/actions/autoPayActions';
import {
  markBillPaid,
  type WrittenPaidMark,
} from '@apps/runway/store/actions/moveActions';
import { selectAutoBills } from '@apps/runway/store/selectors/autoPaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectBillPayments,
  selectIsAccountsLoaded,
  selectIsLinkHistory,
  selectIsMovesLoaded,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectLinkWaiting,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';
import { getMarkCardId } from '@apps/runway/utils/cardText';
import {
  getChargeSnoozeVersion,
  isChargeSnoozed,
  snoozeCharge,
  subscribeChargeSnoozes,
} from '@apps/runway/utils/chargeSnooze';

const toWritten = (billId: string, paid: PaidPayment): WrittenPaidMark => ({
  moveId: paid.moveId,
  billId,
  dueOn: paid.dueOn,
  amountCents: paid.amountCents,
  paidOn: paid.paidOn,
  fromFreeCents: paid.fromFreeCents,
  cardId: paid.cardId,
  auto: paid.auto ?? null,
});

/** The ledger, plan and bank charges an automatic mark or match reads are all loaded. */
const selectIsAutoPayReady = (state: Parameters<typeof selectLevel>[0]) =>
  selectIsMovesLoaded(state) &&
  selectIsRecordsReady(state) &&
  selectIsPlanItemsLoaded(state) &&
  state.runway.isMatchKeysLoaded &&
  state.runway.purchasesFrom !== null &&
  selectIsAccountsLoaded(state) &&
  selectIsNeedsHomeLoaded(state);

const findBillPayment = (billId: string, dueOn: DateOnly) =>
  selectBillPayments(store.getState(), todayAsUtcDate())[billId]?.find(
    (payment) => payment.dueOn === dueOn,
  ) ?? null;

async function writeAutoMark(uid: string, mark: AutoMark) {
  const encryption = await getRunwayEncryption(uid);
  const state = store.getState();
  const payment = findBillPayment(mark.billId, mark.dueOn);
  const written = await inTurn(() =>
    markBillPaid(uid, encryption, {
      billId: mark.billId,
      billName: mark.billName,
      dueOn: mark.dueOn,
      amountCents: mark.amountCents,
      fundedCents: payment ? getHeldFor(payment, mark.amountCents) : 0,
      paidOn: mark.dueOn,
      cardId: getMarkCardId(state, mark.billId, mark.dueOn),
      marks: countMarks(state.runway.moves, mark.billId, mark.dueOn),
      auto: { isEstimate: mark.isEstimate, purchaseId: null },
    }),
  );
  return written;
}

interface ChargeToMatch {
  purchase: OpenPurchase;
  billId: string;
  billName: string;
  dueOn: DateOnly;
  isPicked: boolean;
}

async function writeMatch(uid: string, charge: ChargeToMatch) {
  const encryption = await getRunwayEncryption(uid);
  const state = store.getState();
  const payment = findBillPayment(charge.billId, charge.dueOn);
  const result = await inTurn(() =>
    matchChargeToBill(uid, encryption, {
      purchase: charge.purchase,
      bill: { id: charge.billId, name: charge.billName },
      payment: {
        dueOn: charge.dueOn,
        paid: payment?.paid ? toWritten(charge.billId, payment.paid) : null,
        marks: countMarks(state.runway.moves, charge.billId, charge.dueOn),
        fundedCents: payment
          ? getHeldFor(payment, charge.purchase.amountCents)
          : 0,
      },
      cardId: getMarkCardId(state, charge.billId, charge.dueOn),
      learn: true,
      isPicked: charge.isPicked,
    }),
  );
  return result;
}

/** Says a match was made, with an Undo that takes every match of the toast back. */
function useMatchedToast() {
  const { addToast } = useToast();

  const undo = async (uid: string, results: readonly ChargeMatchResult[]) => {
    try {
      const encryption = await getRunwayEncryption(uid);
      await [...results].reverse().reduce(async (previous, result) => {
        await previous;
        await inTurn(() => undoChargeMatch(uid, encryption, result));
      }, Promise.resolve());
      addToast({ title: AUTO_PAY_WORDS.undone, type: 'success' });
    } catch (undoError) {
      addToast({
        title: AUTO_PAY_WORDS.undoFailed,
        description: getErrorMessage(undoError, ''),
        type: 'error',
      });
    }
  };

  return (
    uid: string,
    results: readonly ChargeMatchResult[],
    title: string,
  ) => {
    addToast({
      title,
      description: AUTO_PAY_WORDS.matchedSub,
      type: 'success',
      action: {
        label: AUTO_PAY_WORDS.undo,
        onClick: () => void undo(uid, results),
      },
    });
  };
}

const toMatchKey = (match: ChargeMatch) =>
  `match:${match.purchase.id}:${match.purchase.updatedAt}:${getPaymentKey(match.billId, match.payment.dueOn)}`;

/**
 * Once the ledger is read, writes the paid mark of each bill that pays itself on its due day (quietly) and, at Link, matches each
 * bank charge that is clearly a bill's payment, with one toast and an Undo per run. Marks go first and matches wait for the store to
 * show them. A failed write is tried again on the next run; each is tried once per version of what it reads.
 */
export function useAutoPay(uid: string | null) {
  const today = todayAsUtcDate(useNow(60_000));
  const level = useAppSelector(selectLevel);
  const bills = useAppSelector((state) => selectAutoBills(state, today));
  const waiting = useAppSelector(selectLinkWaiting);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const accounts = useAppSelector(selectAccounts);
  const isReady = useAppSelector(selectIsAutoPayReady);
  const showMatched = useMatchedToast();
  const showMatchedRef = useRef(showMatched);
  const tried = useRef(new Set<string>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    showMatchedRef.current = showMatched;
  });

  useEffect(() => {
    if (uid === null || !isReady || !isTrackingLevel(level)) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const marks = findAutoMarks({ level, today, bills })
      .map((mark) => ({
        mark,
        key: `mark:${getPaymentKey(mark.billId, mark.dueOn)}`,
      }))
      .filter(({ key }) => !tried.current.has(key));
    const matches =
      marks.length > 0
        ? []
        : findChargeMatches({
            level,
            today,
            bills,
            waiting,
            pullAccountId: resolvePayFromAccountId(null, accounts),
            matched: getMatchedKeys(purchases),
          })
            .map((match) => ({ match, key: toMatchKey(match) }))
            .filter(({ key }) => !tried.current.has(key));
    if (marks.length + matches.length === 0) return;
    const keys = [...marks, ...matches].map(({ key }) => key);
    keys.forEach((key) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await marks.reduce(async (previous, { mark, key }) => {
          await previous;
          try {
            await writeAutoMark(uid, mark);
          } catch (error) {
            tried.current.delete(key);
            console.error('A bill that pays itself was not marked', error);
          }
        }, Promise.resolve());
        const results = await matches.reduce(
          async (done, { match, key }) => {
            const list = await done;
            try {
              const result = await writeMatch(uid, {
                purchase: match.purchase,
                billId: match.billId,
                billName: match.billName,
                dueOn: match.payment.dueOn,
                isPicked: false,
              });
              return [...list, result];
            } catch (error) {
              tried.current.delete(key);
              console.error('A charge was not matched to its bill', error);
              return list;
            }
          },
          Promise.resolve([] as ChargeMatchResult[]),
        );
        if (results.length > 0) {
          showMatchedRef.current(
            uid,
            results,
            results.length === 1
              ? AUTO_PAY_WORDS.matchedOne(results[0].billName)
              : AUTO_PAY_WORDS.matchedMany(results.length),
          );
        }
      } catch (error) {
        keys.forEach((key) => tried.current.delete(key));
        console.error('Bills that pay themselves were not written', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [uid, isReady, level, today, bills, waiting, purchases, accounts, runs]);
}

/** The questions bills that pay themselves leave: at Track the real amount of a ranged bill, at Link the charge that was this payment. Empty until the ledger is read. */
export function useAutoChecks(): { checks: AutoCheck[]; isReady: boolean } {
  const today = todayAsUtcDate(useNow(60_000));
  const level = useAppSelector(selectLevel);
  const bills = useAppSelector((state) => selectAutoBills(state, today));
  const purchases = useAppSelector((state) => state.runway.purchases);
  const isReady = useAppSelector(selectIsAutoPayReady);
  const snoozes = useSyncExternalStore(
    subscribeChargeSnoozes,
    getChargeSnoozeVersion,
  );
  const checks = useMemo(
    () =>
      isReady
        ? findAutoChecks({
            level,
            today,
            bills,
            matched: getMatchedKeys(purchases),
            snoozed: new Set(
              bills
                .flatMap((bill) =>
                  bill.payments.map((payment) =>
                    getPaymentKey(bill.id, payment.dueOn),
                  ),
                )
                .filter((key) => isChargeSnoozed(key)),
            ),
          })
        : [],
    // The snooze version changes when a question is put off; the set is read from the device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isReady, level, today, bills, purchases, snoozes],
  );
  return { checks, isReady };
}

/** The charges a person can pick as one payment's, closest first. */
export function useChargeCandidates(billId: string, dueOn: DateOnly) {
  const today = todayAsUtcDate(useNow(60_000));
  const bills = useAppSelector((state) => selectAutoBills(state, today));
  const purchases = useAppSelector((state) => state.runway.purchases);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const accounts = useAppSelector(selectAccounts);
  const isLinkHistory = useAppSelector(selectIsLinkHistory);
  const candidates = useMemo(() => {
    const bill = bills.find((entry) => entry.id === billId);
    const payment = bill?.payments.find((entry) => entry.dueOn === dueOn);
    return bill && payment
      ? rankChargeCandidates({
          bill,
          payment,
          purchases: [...needsHome, ...purchases],
          pullAccountId: resolvePayFromAccountId(null, accounts),
          isLinkHistory,
        })
      : [];
  }, [bills, billId, dueOn, purchases, needsHome, accounts, isLinkHistory]);
  return candidates;
}

/** Matches the charge a person picked to a payment, learning its name, with an Undo toast; resolves with whether it was written. */
export function usePickCharge() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const showMatched = useMatchedToast();

  const pick = async (
    purchase: OpenPurchase,
    billId: string,
    billName: string,
    dueOn: DateOnly,
  ) => {
    if (!user) return false;
    try {
      const result = await writeMatch(user.uid, {
        purchase,
        billId,
        billName,
        dueOn,
        isPicked: true,
      });
      showMatched(user.uid, [result], AUTO_PAY_WORDS.pickedOne(billName));
      return true;
    } catch (error) {
      addToast({
        title: AUTO_PAY_WORDS.matchFailed,
        description: navigator.onLine
          ? getErrorMessage(error, 'Nothing was changed.')
          : AUTO_PAY_WORDS.needsConnection,
        type: 'error',
      });
      return false;
    }
  };
  return pick;
}

/** Corrects an automatic mark to what the payment really came to; resolves with whether it was written. */
export function useCorrectPaidAmount() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const correct = async (input: {
    billId: string;
    billName: string;
    dueOn: DateOnly;
    amountCents: number;
  }) => {
    if (!user) return false;
    try {
      const paid = findBillPayment(input.billId, input.dueOn)?.paid ?? null;
      if (paid === null) throw new Error(AUTO_PAY_WORDS.changedElsewhere);
      const encryption = await getRunwayEncryption(user.uid);
      await inTurn(() =>
        correctPaidAmount(user.uid, encryption, {
          billId: input.billId,
          billName: input.billName,
          mark: toWritten(input.billId, paid),
          amountCents: input.amountCents,
          purchaseId: null,
        }),
      );
      addToast({
        title: AUTO_PAY_WORDS.amountSaved(input.billName),
        type: 'success',
      });
      return true;
    } catch (error) {
      addToast({
        title: AUTO_PAY_WORDS.amountFailed(input.billName),
        description: navigator.onLine
          ? getErrorMessage(error, 'Nothing was changed.')
          : AUTO_PAY_WORDS.needsConnection,
        type: 'error',
      });
      return false;
    }
  };
  return correct;
}

/** Makes a bill forget the merchant names it learned; resolves with whether it was written. */
export function useForgetBillMatch() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const forget = async (billId: string, billName: string) => {
    if (!user) return false;
    try {
      await forgetBillMatch(user.uid, billId);
      addToast({ title: AUTO_PAY_WORDS.forgot(billName), type: 'success' });
      return true;
    } catch (error) {
      addToast({
        title: AUTO_PAY_WORDS.forgetFailed(billName),
        description: navigator.onLine
          ? getErrorMessage(error, 'Nothing was changed.')
          : AUTO_PAY_WORDS.needsConnection,
        type: 'error',
      });
      return false;
    }
  };
  return forget;
}

/** Puts a payment's "Which charge was this?" off for a few days, on this device. */
export function useSnoozeCharge() {
  const snooze = (billId: string, dueOn: DateOnly) =>
    snoozeCharge(getPaymentKey(billId, dueOn));
  return snooze;
}
