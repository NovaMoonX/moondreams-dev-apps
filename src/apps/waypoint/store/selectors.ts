import type { RootState } from '@/store';
import type { TripExpense } from '@apps/waypoint/types';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const selectTrips = (state: RootState) => state.waypoint.trip.items;

export const selectTripById =
  (tripId: string | null | undefined) => (state: RootState) =>
    tripId
      ? (state.waypoint.trip.items.find((trip) => trip.id === tripId) ?? null)
      : null;

export function selectShouldShowAlbumReminder(
  state: RootState,
  tripId: string,
  currentUserId: string,
  now = Date.now(),
) {
  const trip = state.waypoint.trip.items.find((item) => item.id === tripId);
  if (!trip || now < trip.startDate || now > trip.endDate + DAY_MS) {
    return false;
  }

  const dayEnd = Math.min(
    trip.endDate + DAY_MS,
    trip.startDate +
      (Math.floor((now - trip.startDate) / DAY_MS) + 1) * DAY_MS,
  );
  const isNearEnd = now >= dayEnd - REMINDER_WINDOW_MS;
  const canSetAlbum =
    trip.members[currentUserId]?.role === 'ADMIN' ||
    trip.members[currentUserId]?.role === 'EDITOR';

  return isNearEnd && (trip.sharedAlbumUrl !== null || canSetAlbum);
}

export const selectTripExpenses = (state: RootState) =>
  state.waypoint.expenses.items;

interface ExpenseTotal {
  min: number;
  max: number;
}

export interface TripExpenseTotals {
  paid: ExpenseTotal;
  expected: ExpenseTotal;
  total: ExpenseTotal;
}

function getExpenseValue(expense: TripExpense): ExpenseTotal {
  if (expense.amount !== null) {
    return { min: expense.amount, max: expense.amount };
  }

  if (expense.status === 'PAID' && expense.paidAmount !== null) {
    return { min: expense.paidAmount, max: expense.paidAmount };
  }

  return {
    min: expense.amountMin ?? 0,
    max: expense.amountMax ?? expense.amountMin ?? 0,
  };
}

function addExpenseValue(total: ExpenseTotal, expense: TripExpense) {
  const value = getExpenseValue(expense);
  total.min += value.min;
  total.max += value.max;
}

export function computeExpenseTotals(expenses: TripExpense[]): TripExpenseTotals {
  const totals: TripExpenseTotals = {
    paid: { min: 0, max: 0 },
    expected: { min: 0, max: 0 },
    total: { min: 0, max: 0 },
  };

  for (const expense of expenses) {
    addExpenseValue(totals.total, expense);
    addExpenseValue(expense.status === 'PAID' ? totals.paid : totals.expected, expense);
  }

  return totals;
}

export const selectTripExpenseTotals = (state: RootState): TripExpenseTotals =>
  computeExpenseTotals(state.waypoint.expenses.items);

export const selectTimelineEvents = (state: RootState) => state.waypoint.events.items;

export const selectEventsByDay =
  (dayIndex: number) => (state: RootState) =>
    state.waypoint.events.items.filter((event) => event.dayIndex === dayIndex);
