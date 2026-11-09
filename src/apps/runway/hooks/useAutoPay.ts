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
  findAutoMarks,
  findHeldPaymentKeys,
  findChargeMatches,
  getMatchedKeys,
  getPaymentKey,
  rankChargeCandidates,
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
  unmatchBillCharge,
  type ChargeMatchResult,
} from '@apps/runway/store/actions/autoPayActions';
import {
  markBillPaid,
  type WrittenPaidMark,
} from '@apps/runway/store/actions/moveActions';
import {
  selectAutoBills,
  selectAutoChecks,
  selectIsAutoPayReady,
} from '@apps/runway/store/selectors/autoPaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectBillPayments,
  selectIsLinkHistory,
  selectLinkWaiting,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';
import { getMarkCardId } from '@apps/runway/utils/cardText';
import {
  getChargeSnoozeVersion,
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

/** Charges a match is writing, so the device pass and a pick never both take one. */
const claimedCharges = new Set<string>();

/** Writes the match unless another is writing the same charge; resolves null then. */
async function writeMatch(uid: string, charge: ChargeToMatch) {
  const id = charge.purchase.id;
  if (claimedCharges.has(id)) return null;
  claimedCharges.add(id);
  try {
    return await writeClaimedMatch(uid, charge);
  } finally {
    claimedCharges.delete(id);
  }
}

async function writeClaimedMatch(uid: string, charge: ChargeToMatch) {
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

/** Writes the marks of bills that pay themselves and, at Link, matches clear charges. A failed mark is not retried this session. */
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
    const pullAccountId = resolvePayFromAccountId(null, accounts);
    const matched = getMatchedKeys(purchases);
    const marks = findAutoMarks({
      level,
      today,
      bills,
      held: findHeldPaymentKeys({
        today,
        bills,
        waiting,
        pullAccountId,
        matched,
      }),
    })
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
            pullAccountId,
            matched,
          })
            .map((match) => ({ match, key: toMatchKey(match) }))
            .filter(({ key }) => !tried.current.has(key));
    if (marks.length + matches.length === 0) return;
    const keys = [...marks, ...matches].map(({ key }) => key);
    keys.forEach((key) => tried.current.add(key));
    isRunning.current = true;
    const run = async () => {
      try {
        await marks.reduce(async (previous, { mark }) => {
          await previous;
          try {
            await writeAutoMark(uid, mark);
          } catch (error) {
            console.error('A bill that pays itself was not marked', error);
          }
        }, Promise.resolve());
        const results = await matches.reduce(
          async (done, { match, key }) => {
            const list = await done;
            const current = store
              .getState()
              .runway.purchases.find((entry) => entry.id === match.purchase.id);
            if (current && current.updatedAt !== match.purchase.updatedAt) {
              tried.current.delete(key);
              return list;
            }
            try {
              const result = await writeMatch(uid, {
                purchase: match.purchase,
                billId: match.billId,
                billName: match.billName,
                dueOn: match.payment.dueOn,
                isPicked: false,
              });
              if (result === null) {
                tried.current.delete(key);
                return list;
              }
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

const NO_CHECKS: ReturnType<typeof selectAutoChecks> = [];

/** The questions bills that pay themselves leave; `isEnabled` false skips it on a screen with no bill. */
export function useAutoChecks(isEnabled = true) {
  const today = todayAsUtcDate(useNow(60_000));
  const snoozes = useSyncExternalStore(
    subscribeChargeSnoozes,
    getChargeSnoozeVersion,
  );
  const checks = useAppSelector((state) =>
    isEnabled ? selectAutoChecks(state, today, snoozes) : NO_CHECKS,
  );
  return { checks };
}

/** The charges a person can pick as one payment's, closest first, with the payment's range. */
export function useChargeCandidates(billId: string, dueOn: DateOnly) {
  const today = todayAsUtcDate(useNow(60_000));
  const bills = useAppSelector((state) => selectAutoBills(state, today));
  const purchases = useAppSelector((state) => state.runway.purchases);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const accounts = useAppSelector(selectAccounts);
  const isLinkHistory = useAppSelector(selectIsLinkHistory);
  return useMemo(() => {
    const bill = bills.find((entry) => entry.id === billId);
    const payment = bill?.payments.find((entry) => entry.dueOn === dueOn);
    return bill && payment
      ? {
          payment,
          candidates: rankChargeCandidates({
            bill,
            payment,
            purchases: [...needsHome, ...purchases],
            pullAccountId: resolvePayFromAccountId(null, accounts),
            isLinkHistory,
          }),
        }
      : { payment: null, candidates: [] };
  }, [bills, billId, dueOn, purchases, needsHome, accounts, isLinkHistory]);
}

/** Matches the charge a person picked to a payment, learning its name, with an Undo toast; resolves true once the charge is matched, by this pick or the device's own pass. */
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
      if (result === null) {
        addToast({ title: AUTO_PAY_WORDS.matchedJustNow, type: 'info' });
        return true;
      }
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

/** Takes a matched charge off its bill and the mark it settled with it; the mark goes back to an estimate only below Link. */
export async function unmatchPurchaseFromBill(
  uid: string,
  purchase: OpenPurchase,
  billName: string,
): Promise<void> {
  const ref = purchase.billRef ?? null;
  if (ref === null) return;
  const encryption = await getRunwayEncryption(uid);
  const state = store.getState();
  const level = selectLevel(state);
  const bill = selectAutoBills(state, todayAsUtcDate()).find(
    (entry) => entry.id === ref.billId,
  );
  const slot = bill?.payments.find((entry) => entry.dueOn === ref.dueOn);
  const isMarkedByApp =
    bill !== undefined &&
    isTrackingLevel(level) &&
    level !== 'link' &&
    !bill.undoneDueOn.includes(ref.dueOn);
  const paid = findBillPayment(ref.billId, ref.dueOn)?.paid ?? null;
  await inTurn(() =>
    unmatchBillCharge(uid, encryption, {
      purchase,
      billName,
      mark: paid === null ? null : toWritten(ref.billId, paid),
      restore:
        isMarkedByApp && slot
          ? {
              amountCents: slot.highCents,
              isEstimate: slot.lowCents !== slot.highCents,
            }
          : null,
    }),
  );
}

/** Takes a matched charge off its bill; resolves with whether it was written. */
export function useUnmatchCharge() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const unmatch = async (purchase: OpenPurchase, billName: string) => {
    if (!user || (purchase.billRef ?? null) === null) return false;
    try {
      await unmatchPurchaseFromBill(user.uid, purchase, billName);
      addToast({ title: AUTO_PAY_WORDS.unmatched, type: 'success' });
      return true;
    } catch (error) {
      addToast({
        title: AUTO_PAY_WORDS.unmatchFailed,
        description: navigator.onLine
          ? getErrorMessage(error, 'Nothing was changed.')
          : AUTO_PAY_WORDS.needsConnection,
        type: 'error',
      });
      return false;
    }
  };
  return unmatch;
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
