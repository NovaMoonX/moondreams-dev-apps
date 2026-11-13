import { toDisplayCase } from '@/utils/optionMatchUtils';
import { BILLS_NOTICED_WORDS } from '@apps/runway/constants';
import type { BillSealed, RecurringStream, Schedule } from '@apps/runway/types';
import type { ChargedPlace } from '@apps/runway/engine/chargedTo';

/** The merchant as a bill would be named. */
export const getStreamName = (stream: RecurringStream) =>
  toDisplayCase(stream.merchantName ?? stream.description, {
    style: 'title',
    keepAcronyms: true,
    keepMixedCase: true,
  });

export const describeStreamHow = (stream: RecurringStream) =>
  BILLS_NOTICED_WORDS.frequency[stream.frequency];

/** The schedule a repeating charge suggests from its next expected day; undated when the bank gave no next day or the repeat has no kind the bill form offers (twice a month), so the person sets it. */
export function getStreamSchedule(stream: RecurringStream): Schedule {
  const anchor = stream.nextOn;
  const undated: Schedule = { kind: 'once', anchor: null, monthDays: [] };
  if (anchor === null) return undated;
  if (stream.frequency === 'weekly') {
    return { kind: 'weekly', anchor, monthDays: [] };
  }
  if (stream.frequency === 'biweekly') {
    return { kind: 'everyOtherWeek', anchor, monthDays: [] };
  }
  if (stream.frequency === 'monthly') {
    return {
      kind: 'monthly',
      anchor,
      monthDays: [new Date(anchor).getUTCDate()],
    };
  }
  if (stream.frequency === 'annually') {
    return { kind: 'everyMonths', anchor, monthDays: [], intervalMonths: 12 };
  }
  return undated;
}

/** A new bill filled from a repeating charge, charged where the charge was. */
export const getStreamBill = (
  stream: RecurringStream,
  place: ChargedPlace,
): BillSealed => ({
  name: getStreamName(stream),
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  amount: { lowCents: stream.lastCents, highCents: stream.lastCents },
  timing: { kind: 'date', schedule: getStreamSchedule(stream) },
  ending: { onDate: null, afterCount: null },
  fundedBy: { kind: 'suggested' },
  stanceOverride: null,
  groupId: null,
  paidByCardId: place.kind === 'card' ? place.id : null,
  accountId: place.kind === 'account' ? place.id : null,
  paysItself: false,
  payOnDay: null,
});
