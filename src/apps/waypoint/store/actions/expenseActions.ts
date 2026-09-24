import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  ExpenseCategory,
  ExpenseStatus,
  ExpenseTargetType,
  TripExpense,
} from '@apps/waypoint/types';

interface CreateExpenseInput {
  uid: string;
  tripId: string;
  memberIds: string[];
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string;
  payerUid: string | null;
  status: ExpenseStatus;
  dayIndex: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
  groupLabel: string | null;
  isPerPerson: boolean;
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
    isPerPerson: input.isPerPerson,
    payerUid: input.status === 'PAID' ? input.payerUid : null,
    status: input.status,
    category: input.category,
    customCategoryLabel:
      input.category === 'OTHER' ? input.customCategoryLabel?.trim() || null : null,
    targetType: 'EVERYONE_CURRENT',
    targetMemberIds: input.memberIds,
    splitAmounts: null,
    paidMemberStatus,
    note: input.note?.trim() || null,
    groupLabel: input.groupLabel?.trim() || null,
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
  payerUid: string | null;
  status: ExpenseStatus;
  dayIndex: number | null;
  paidAmount: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
  groupLabel: string | null;
  isPerPerson: boolean;
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

  const changes = {
    title,
    amount: input.amount,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    payerUid: input.status === 'PAID' ? input.payerUid : null,
    status: input.status,
    dayIndex: input.dayIndex,
    paidAmount: input.expense.amount === null ? input.paidAmount : null,
    category: input.category,
    customCategoryLabel:
      input.category === 'OTHER' ? input.customCategoryLabel?.trim() || null : null,
    note: input.note?.trim() || null,
    groupLabel: input.groupLabel?.trim() || null,
    isPerPerson: input.isPerPerson,
    lastEditedAt: Date.now(),
  };

  await updateDoc(
    doc(db, 'apps', 'waypoint', 'trips', input.expense.tripId, 'expenses', input.expense.id),
    changes,
  );
  return { ...input.expense, ...changes };
});

interface UpdateExpenseSplitInput {
  expense: TripExpense;
  targetType: ExpenseTargetType;
  targetMemberIds: string[];
  splitAmounts: Record<string, number> | null;
}

export const updateExpenseSplit = createAsyncThunk<
  TripExpense,
  UpdateExpenseSplitInput,
  { rejectValue: string }
>('waypoint/expenses/updateSplit', async (input, { rejectWithValue }) => {
  if (input.targetType === 'SPECIFIC_MEMBERS' && input.targetMemberIds.length === 0) {
    return rejectWithValue('Select at least one member.');
  }

  const changes = {
    targetType: input.targetType,
    targetMemberIds: input.targetMemberIds,
    splitAmounts: input.splitAmounts,
    category: input.expense.category,
    customCategoryLabel: input.expense.customCategoryLabel,
    note: input.expense.note,
    groupLabel: input.expense.groupLabel,
    isPerPerson: input.expense.isPerPerson,
    lastEditedAt: Date.now(),
  };

  await updateDoc(
    doc(db, 'apps', 'waypoint', 'trips', input.expense.tripId, 'expenses', input.expense.id),
    changes,
  );
  return { ...input.expense, ...changes };
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
  payerUid: string | null;
  paidAmount: number | null;
}

export const markExpensePaid = createAsyncThunk<TripExpense, MarkExpensePaidInput>(
  'waypoint/expenses/markPaid',
  async ({ expense, payerUid, paidAmount }) => {
    const updatedExpense: TripExpense = {
      ...expense,
      status: 'PAID',
      payerUid,
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
