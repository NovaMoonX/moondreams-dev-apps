import type { PillOption } from '@/components/PillGroup';
import {
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { centsToInputValue } from '@/utils/moneyUtils';
import { MAX_BUYER_NAME_LENGTH } from '@apps/going-once/constants';
import type {
  Inquiry,
  Item,
  ItemPendingRecord,
  PaymentMethod,
} from '@apps/going-once/types';

export const OTHER_DAY = 'other';
const DAYS_SHOWN = 7;

/** What the person has typed or chosen in Mark pending, or in Change who or when. */
export interface HoldDraft {
  /** The inquiry the name was taken from; `null` once the name is typed. */
  inquiryId: string | null;
  name: string;
  isDayShown: boolean;
  /** A date input's text. */
  day: string;
  isOtherDay: boolean;
}

/** What the person has typed or chosen in Mark sold. */
export interface SoldDraft {
  amount: string;
  method: PaymentMethod | null;
  soldOn: string;
}

/** Today and the next six days as pills, each valued as a local date input's text. */
export const getDayOptions = (now: number): PillOption<string>[] => {
  const today = new Date(now);
  return Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
    );
    return {
      value: toLocalDateInputValue(day.getTime()),
      label:
        offset === 0
          ? 'Today'
          : day.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  });
};

/** The hold as it stands (empty for a new one), so a changed hold opens with its name and day filled in. */
export function getHoldDraft(
  pending: ItemPendingRecord | null,
  now: number,
): HoldDraft {
  const day = pending?.pickupOn ? toDateInputValue(pending.pickupOn) : '';
  return {
    inquiryId: pending?.inquiryId ?? null,
    name: pending?.buyerName ?? '',
    isDayShown: day !== '',
    day,
    isOtherDay:
      day !== '' && !getDayOptions(now).some((option) => option.value === day),
  };
}

/** Mark pending opens empty, or with the name of the inquiry it is held for. */
export const getHoldStart = (
  inquiry: Pick<Inquiry, 'id' | 'name'> | null,
  now: number,
): HoldDraft => ({
  ...getHoldDraft(null, now),
  inquiryId: inquiry?.name ? inquiry.id : null,
  name: inquiry?.name?.trim().slice(0, MAX_BUYER_NAME_LENGTH) ?? '',
});

/** Mark sold opens on the asking price, paid today, no method. */
export const getSoldDraft = (
  item: Pick<Item, 'askingPriceCents'>,
  now: number,
): SoldDraft => ({
  amount: centsToInputValue(item.askingPriceCents),
  method: null,
  soldOn: toLocalDateInputValue(now),
});

/** Whether the person has changed anything since the view opened. */
export const isDraftChanged = <T extends object>(draft: T, initial: T) =>
  JSON.stringify(draft) !== JSON.stringify(initial);
