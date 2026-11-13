import type {
  Cents,
  DateOnly,
  MoneyRange,
  RecurringStream,
} from '@apps/runway/types';

import { toComparable } from '@/utils/optionMatchUtils';

import { areKeysNamedLike } from './autoPay';
import type { ChargedPlace } from './chargedTo';

export interface RecurringBill {
  id: string;
  name: string;
  merchantKeys: readonly string[];
  /** What the bill's current version holds. */
  amount: MoneyRange;
  isCardFee: boolean;
}

export interface RecurringProviderAccount {
  linkId: string;
  providerAccountId: string;
  name: string;
  mask: string | null;
  /** Bound to one of the person's accounts or cards, an archived one included. */
  isPlaced: boolean;
}

export interface RecurringStreamInput {
  stream: RecurringStream;
  /** The open account or card the provider account is bound to; null when it is unbound or the one bound is archived. */
  place: ChargedPlace | null;
  providerAccount: RecurringProviderAccount;
}

export type RecurringHint =
  | {
      kind: 'amount';
      key: string;
      billId: string;
      stream: RecurringStream;
      current: MoneyRange;
      suggested: MoneyRange;
    }
  | {
      kind: 'newBill';
      key: string;
      stream: RecurringStream;
      place: ChargedPlace;
      providerAccount: RecurringProviderAccount;
      amountCents: Cents;
      nextOn: DateOnly | null;
    }
  | {
      kind: 'place';
      key: string;
      providerAccount: RecurringProviderAccount;
      /** Largest last charge first. */
      streams: RecurringStream[];
    };

const SAME_AMOUNT_PERCENT = 1;
const SAME_AMOUNT_MIN_CENTS = 50;

const isIgnoredCategory = (category: string | null) =>
  category !== null &&
  (category.startsWith('TRANSFER_OUT') ||
    category.startsWith('TRANSFER_IN') ||
    category === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT');

const isUsable = (stream: RecurringStream) =>
  stream.isActive &&
  stream.status === 'mature' &&
  stream.frequency !== 'unknown' &&
  !isIgnoredCategory(stream.category);

export const getStreamKeys = (stream: RecurringStream): string[] => {
  const key = toComparable(stream.merchantName ?? stream.description);
  return key === '' ? [] : [key];
};

const getSuggestedAmount = (stream: RecurringStream): MoneyRange => {
  const { averageCents: average, lastCents: last } = stream;
  const margin = Math.max(
    Math.round((last * SAME_AMOUNT_PERCENT) / 100),
    SAME_AMOUNT_MIN_CENTS,
  );
  return Math.abs(average - last) <= margin
    ? { lowCents: last, highCents: last }
    : {
        lowCents: Math.min(average, last),
        highCents: Math.max(average, last),
      };
};

interface PreparedBill {
  bill: RecurringBill;
  name: string;
}

const findBill = (bills: readonly PreparedBill[], keys: readonly string[]) =>
  bills.find(({ bill }) => keys.some((key) => bill.merchantKeys.includes(key)))
    ?.bill ??
  bills.find(({ bill, name }) =>
    areKeysNamedLike(name, bill.merchantKeys, keys),
  )?.bill ??
  null;

const byLastDesc = (a: RecurringStream, b: RecurringStream) =>
  b.lastCents - a.lastCents || (a.streamId < b.streamId ? -1 : 1);

/** What the bank's repeating charges suggest: a bill whose amount moved, a charge no bill covers yet, and accounts whose charges would be read once the person says which of theirs they are. Amount first, then new bills, then places. */
export function findRecurringHints(input: {
  bills: readonly RecurringBill[];
  streams: readonly RecurringStreamInput[];
  dismissed: (key: string) => boolean;
}): RecurringHint[] {
  const bills: PreparedBill[] = input.bills.map((bill) => ({
    bill,
    name: toComparable(bill.name),
  }));
  const usable = input.streams.filter(({ stream }) => isUsable(stream));

  const matched = usable
    .filter(({ providerAccount }) => providerAccount.isPlaced)
    .flatMap((entry) => {
      const bill = findBill(bills, getStreamKeys(entry.stream));
      return entry.place ? [{ ...entry, place: entry.place, bill }] : [];
    });

  const amountHints = [
    ...matched
      .flatMap(({ stream, bill }): RecurringHint[] => {
        if (
          !bill ||
          bill.isCardFee ||
          (stream.lastCents >= bill.amount.lowCents &&
            stream.lastCents <= bill.amount.highCents)
        ) {
          return [];
        }
        const suggested = getSuggestedAmount(stream);
        return [
          {
            kind: 'amount',
            key: `amount:${bill.id}:${stream.streamId}:${suggested.lowCents}:${suggested.highCents}`,
            billId: bill.id,
            stream,
            current: bill.amount,
            suggested,
          },
        ];
      })
      .filter((hint) => !input.dismissed(hint.key))
      .sort(
        (a, b) =>
          (a.kind === 'amount' && b.kind === 'amount'
            ? b.stream.lastOn - a.stream.lastOn
            : 0) || (a.key < b.key ? -1 : 1),
      )
      .reduce((byBill, hint) => {
        if (hint.kind === 'amount' && !byBill.has(hint.billId)) {
          byBill.set(hint.billId, hint);
        }
        return byBill;
      }, new Map<string, RecurringHint>())
      .values(),
  ];

  const newBillHints = matched
    .filter(({ bill }) => bill === null)
    .sort((a, b) => byLastDesc(a.stream, b.stream))
    .map(({ stream, place, providerAccount }): RecurringHint => ({
      kind: 'newBill',
      key: `new:${stream.streamId}`,
      stream,
      place,
      providerAccount,
      amountCents: stream.lastCents,
      nextOn: stream.nextOn,
    }))
    .filter((hint) => !input.dismissed(hint.key));

  const placeHints = [
    ...usable
      .filter(({ providerAccount }) => !providerAccount.isPlaced)
      .reduce((byAccount, { stream, providerAccount }) => {
        const key = `place:${providerAccount.linkId}:${providerAccount.providerAccountId}`;
        const found = byAccount.get(key);
        byAccount.set(key, {
          providerAccount,
          streams: [...(found?.streams ?? []), stream],
        });
        return byAccount;
      }, new Map<string, { providerAccount: RecurringProviderAccount; streams: RecurringStream[] }>())
      .entries(),
  ]
    .map(([key, { providerAccount, streams }]): RecurringHint => ({
      kind: 'place',
      key,
      providerAccount,
      streams: [...streams].sort(byLastDesc),
    }))
    .filter((hint) => !input.dismissed(hint.key))
    .sort(
      (a, b) =>
        (a.kind === 'place' && b.kind === 'place'
          ? a.providerAccount.name.localeCompare(b.providerAccount.name)
          : 0) || (a.key < b.key ? -1 : 1),
    );

  return [...amountHints, ...newBillHints, ...placeHints];
}
