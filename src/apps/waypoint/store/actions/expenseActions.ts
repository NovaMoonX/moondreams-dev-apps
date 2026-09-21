import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { TripExpense, ExpenseStatus } from '@apps/waypoint/types';

interface CreateExpenseInput {
  uid: string;
  tripId: string;
  memberIds: string[];
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: number | null;
}

export const createExpense = createAsyncThunk<
  TripExpense,
  CreateExpenseInput,
  { rejectValue: string }
>('waypoint/expenses/create', async (input, { rejectWithValue }) => {
  const title = input.title.trim();
  const currency = input.currency.trim().toUpperCase();

  if (!title) {
    return rejectWithValue('Expense title is required.');
  }
  if (!currency) {
    return rejectWithValue('Currency is required.');
  }
  if (
    input.amount === null &&
    (input.amountMin === null ||
      input.amountMax === null ||
      input.amountMin < 0 ||
      input.amountMax < input.amountMin)
  ) {
    return rejectWithValue('Enter a valid amount or range.');
  }
  if (
    input.amount !== null &&
    (!Number.isFinite(input.amount) || input.amount < 0)
  ) {
    return rejectWithValue('Enter a valid amount.');
  }

  const expenseRef = doc(
    collection(db, 'apps', 'waypoint', 'trips', input.tripId, 'expenses'),
  );
  const now = Date.now();
  const paidMemberStatus = Object.fromEntries(
    input.memberIds.map((uid) => [uid, { isPaid: false, paidAt: null }]),
  );
  const expense: TripExpense = {
    id: expenseRef.id,
    tripId: input.tripId,
    dayIndex: input.dayIndex,
    title,
    amount: input.amount,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    paidAmount: null,
    currency,
    payerUid: input.payerUid,
    status: input.status,
    targetType: 'EVERYONE_CURRENT',
    targetMemberIds: input.memberIds,
    splitAmounts: null,
    paidMemberStatus,
    createdBy: input.uid,
    createdAt: now,
    lastEditedAt: now,
  };

  await setDoc(expenseRef, expense);
  return expense;
});

interface UpdateExpenseInput {
  expense: TripExpense;
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  payerUid: string;
  dayIndex: number | null;
  paidAmount: number | null;
}

export const updateExpense = createAsyncThunk<
  TripExpense,
  UpdateExpenseInput,
  { rejectValue: string }
>('waypoint/expenses/update', async (input, { rejectWithValue }) => {
  const title = input.title.trim();
  if (!title) {
    return rejectWithValue('Expense title is required.');
  }
  if (
    input.amount === null &&
    (input.amountMin === null ||
      input.amountMax === null ||
      input.amountMin < 0 ||
      input.amountMax < input.amountMin)
  ) {
    return rejectWithValue('Enter a valid amount or range.');
  }
  if (
    input.amount !== null &&
    (!Number.isFinite(input.amount) || input.amount < 0)
  ) {
    return rejectWithValue('Enter a valid amount.');
  }
  if (
    input.paidAmount !== null &&
    (!Number.isFinite(input.paidAmount) || input.paidAmount < 0)
  ) {
    return rejectWithValue('Enter a valid paid amount.');
  }

  const updatedExpense: TripExpense = {
    ...input.expense,
    title,
    amount: input.amount,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    payerUid: input.payerUid,
    dayIndex: input.dayIndex,
    paidAmount: input.expense.amount === null ? input.paidAmount : null,
    lastEditedAt: Date.now(),
  };

  await setDoc(
    doc(db, 'apps', 'waypoint', 'trips', input.expense.tripId, 'expenses', input.expense.id),
    updatedExpense,
  );
  return updatedExpense;
});

export const deleteExpense = createAsyncThunk<
  string,
  TripExpense,
  { rejectValue: string }
>('waypoint/expenses/delete', async (expense) => {
  await deleteDoc(
    doc(db, 'apps', 'waypoint', 'trips', expense.tripId, 'expenses', expense.id),
  );
  return expense.id;
});

interface MarkExpensePaidInput {
  expense: TripExpense;
  paidAmount: number | null;
}

export const markExpensePaid = createAsyncThunk<TripExpense, MarkExpensePaidInput>(
  'waypoint/expenses/markPaid',
  async ({ expense, paidAmount }) => {
    const updatedExpense: TripExpense = {
      ...expense,
      status: 'PAID',
      paidAmount: expense.amount === null ? paidAmount : null,
      lastEditedAt: Date.now(),
    };

    await setDoc(
      doc(db, 'apps', 'waypoint', 'trips', expense.tripId, 'expenses', expense.id),
      updatedExpense,
    );
    return updatedExpense;
  },
);
