import type { PillOption } from '@/components/PillGroup';
import {
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { centsToInputValue } from '@/utils/moneyUtils';
import type {
  Item,
  ItemPendingRecord,
  PaymentMethod,
} from '@apps/going-once/types';

export const OTHER_DAY = 'other';
const DAYS_SHOWN = 7;

/** What the person has typed or chosen in Mark pending, or in Change who or when. */
export interface HoldDraft {
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
    name: pending?.buyerName ?? '',
    isDayShown: day !== '',
    day,
    isOtherDay:
      day !== '' && !getDayOptions(now).some((option) => option.value === day),
  };
}

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
