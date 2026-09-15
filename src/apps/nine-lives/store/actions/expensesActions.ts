import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Expense } from '@apps/nine-lives/types';

import { removeExpense, revertExpense, upsertExpense } from '../slices/expensesSlice';

function normalizeExpenseInput(value: Partial<Expense>): Partial<Expense> {
  const next = { ...value };

  if (next.catIds) {
    next.catIds = [...new Set(next.catIds)];
  }

  if (next.label === undefined) {
    next.label = null;
  }

  if (next.notes === undefined) {
    next.notes = null;
  }

  if (!next.isRecurring) {
    next.recurrenceInterval = null;
  } else if (next.recurrenceInterval === undefined) {
    next.recurrenceInterval = 'monthly';
  }

  return next;
}

const getExpenseDocRef = (householdId: string, expenseId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'expenses', expenseId);

export const createExpense = createAsyncThunk<
  Expense,
  {
    householdId: string;
    uid: string;
    expense: Partial<Expense> &
      Pick<Expense, 'catIds' | 'category' | 'amount' | 'isRecurring' | 'incurredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/expenses/create',
  async ({ householdId, uid, expense }, { dispatch, rejectWithValue }) => {
    const normalizedExpense = normalizeExpenseInput(expense);

    if (!normalizedExpense.catIds || normalizedExpense.catIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    const now = Date.now();
    const expenseId =
      normalizedExpense.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'expenses')).id;

    const nextExpense: Expense = {
      id: expenseId,
      householdId,
      catIds: normalizedExpense.catIds,
      category: expense.category,
      label: normalizedExpense.label ?? null,
      amount: Number(expense.amount),
      isRecurring: Boolean(normalizedExpense.isRecurring),
      recurrenceInterval: normalizedExpense.isRecurring
        ? normalizedExpense.recurrenceInterval ?? 'monthly'
        : null,
      incurredAt: expense.incurredAt,
      notes: normalizedExpense.notes ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getExpenseDocRef(householdId, expenseId), nextExpense);
    dispatch(upsertExpense(nextExpense));

    return nextExpense;
  },
);

export const updateExpense = createAsyncThunk<
  Expense,
  {
    householdId: string;
    expenseId: string;
    changes: Partial<Expense>;
  },
  { rejectValue: string }
>(
  'nineLives/expenses/update',
  async ({ householdId, expenseId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.expenses.items.find((item) => item.id === expenseId);

    if (!current) {
      return rejectWithValue('Expense not found.');
    }

    const sanitizedChanges = normalizeExpenseInput(changes);

    if (sanitizedChanges.catIds && sanitizedChanges.catIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    const nextExpense: Expense = {
      ...current,
      ...sanitizedChanges,
      id: expenseId,
      householdId,
      amount: Number(sanitizedChanges.amount ?? current.amount),
      isRecurring: sanitizedChanges.isRecurring ?? current.isRecurring,
      recurrenceInterval:
        sanitizedChanges.isRecurring === false
          ? null
          : sanitizedChanges.recurrenceInterval ?? current.recurrenceInterval ?? null,
      incurredAt: sanitizedChanges.incurredAt ?? current.incurredAt,
      label: sanitizedChanges.label ?? current.label ?? null,
      notes: sanitizedChanges.notes ?? current.notes ?? null,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertExpense(nextExpense));

    try {
      await updateDoc(getExpenseDocRef(householdId, expenseId), {
        ...sanitizedChanges,
        lastEditedAt: nextExpense.lastEditedAt,
      });
      return nextExpense;
    } catch (error) {
      dispatch(revertExpense({ id: expenseId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update expense.',
      );
    }
  },
);

export const deleteExpense = createAsyncThunk<
  { id: string },
  { householdId: string; expenseId: string },
  { rejectValue: string }
>(
  'nineLives/expenses/delete',
  async ({ householdId, expenseId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.expenses.items.find((item) => item.id === expenseId);

    if (!current) {
      return rejectWithValue('Expense not found.');
    }

    dispatch(removeExpense({ id: expenseId }));

    try {
      await deleteDoc(getExpenseDocRef(householdId, expenseId));
      return { id: expenseId };
    } catch (error) {
      dispatch(revertExpense({ id: expenseId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete expense.',
      );
    }
  },
);
