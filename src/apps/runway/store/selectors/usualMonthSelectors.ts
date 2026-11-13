import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { DAY_MS } from '@apps/runway/engine/dates';

import { capEnding } from '@apps/runway/engine/endings';

import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectResolvedPlan,
  type ResolvedBill,
} from './runwaySelectors';

/** A month from today, so items starting later this month or early next one still count late in a month. */
const USUAL_MONTH_OFFSET_MS = 30 * DAY_MS;

/** The day a usual month is judged on: the first of the month holding today + 30 days, never before today. */
export const getUsualMonthOn = (today: number) => {
  const day = new Date(today + USUAL_MONTH_OFFSET_MS);
  return Math.max(today, Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
};

/** The bills, envelopes, goals and income the plan holds in a usual month, so a change from the 1st counts and an item that ended or has not started is read for that month, not for today. Bills, envelopes and income are read at the version in force when the month begins; goals at its last day, so one that starts mid-month counts from its start month. */
export const selectUsualMonthPlan = createSelector(
  [
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.versions,
    (_state: RootState, today: number) => today,
  ],
  (items, versions, today) => {
    const on = getUsualMonthOn(today);
    const day = new Date(on);
    const lastDay =
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1) - DAY_MS;
    return {
      month: today + USUAL_MONTH_OFFSET_MS,
      bills: selectBills.resultFunc(items, versions, on),
      envelopes: selectEnvelopes.resultFunc(items, versions, on),
      goals: selectGoals.resultFunc(items, versions, lastDay),
      plan: selectResolvedPlan.resultFunc(items, versions, on),
    };
  },
);

/** A bill as a group's total counts it: its ending cut at the day it was ended, so a bill stopped from a date counts nothing in a month after it. */
export const toBillMember = ({ item, version: bill }: ResolvedBill) => ({
  name: bill.payload.name,
  amount: bill.payload.amount,
  schedule: bill.payload.timing.schedule,
  startsOn: bill.effectiveFrom,
  ending: capEnding(bill.payload.ending, item.endedAt),
});

/** The plan's pay lines as a total counts them, each ending cut at the day it was ended. */
export const toPayLines = (plan: ReturnType<typeof selectResolvedPlan>) =>
  plan.flatMap(({ item: source, payLines: lines }) =>
    lines.map(({ item, version }) => ({
      sourceId: source.id,
      payLineId: item.id,
      schedule: version.payload.schedule,
      amount: version.payload.amount,
      startsOn: version.effectiveFrom,
      ending: capEnding(version.payload.ending, item.endedAt),
    })),
  );
