import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Expense } from '@apps/nine-lives/types';

import { removeExpense, revertExpense, upsertExpense } from '../slices/expensesSlice';

function normalizeExpenseInput(value: Partial<Expense>): Partial<Expense> {
  const next = { ...value };

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

const getExpenseDocRef = (householdId: string, catId: string, expenseId: string) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'expenses',
    expenseId,
  );

export const createExpense = createAsyncThunk<
  Expense,
  {
    householdId: string;
    catId: string;
    uid: string;
    expense: Partial<Expense> & Pick<Expense, 'category' | 'amount' | 'isRecurring' | 'incurredAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/expenses/create',
  async ({ householdId, catId, uid, expense }, { dispatch, rejectWithValue }) => {
    const normalizedExpense = normalizeExpenseInput(expense);
    const now = Date.now();
    const expenseId =
      normalizedExpense.id ?? doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId, 'expenses')).id;

    const nextExpense: Expense = {
      id: expenseId,
      catId,
      category: normalizedExpense.category,
      amount: Number(normalizedExpense.amount ?? 0),
      isRecurring: Boolean(normalizedExpense.isRecurring),
      recurrenceInterval: normalizedExpense.isRecurring
        ? normalizedExpense.recurrenceInterval ?? 'monthly'
        : null,
      incurredAt: normalizedExpense.incurredAt,
      notes: normalizedExpense.notes ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getExpenseDocRef(householdId, catId, expenseId), nextExpense);
    dispatch(upsertExpense(nextExpense));

    return nextExpense;
  },
  );

export const updateExpense = createAsyncThunk<
  Expense,
  {
    householdId: string;
    catId: string;
    expenseId: string;
    changes: Partial<Expense>;
  },
  { rejectValue: string }
>(
  'nineLives/expenses/update',
  async ({ householdId, catId, expenseId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.expenses.items.find(
      (item) => item.id === expenseId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Expense not found.');
    }

    const sanitizedChanges = normalizeExpenseInput(changes);
    const nextExpense: Expense = {
      ...current,
      ...sanitizedChanges,
      id: expenseId,
      catId,
      amount: Number(sanitizedChanges.amount ?? current.amount),
      isRecurring: sanitizedChanges.isRecurring ?? current.isRecurring,
      recurrenceInterval:
        sanitizedChanges.isRecurring === false
          ? null
          : sanitizedChanges.recurrenceInterval ?? current.recurrenceInterval ?? null,
      incurredAt: sanitizedChanges.incurredAt ?? current.incurredAt,
      notes: sanitizedChanges.notes ?? current.notes ?? null,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertExpense(nextExpense));

    try {
      await updateDoc(getExpenseDocRef(householdId, catId, expenseId), sanitizedChanges);
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
  { householdId: string; catId: string; expenseId: string },
  { rejectValue: string }
>(
  'nineLives/expenses/delete',
  async ({ householdId, catId, expenseId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.expenses.items.find(
      (item) => item.id === expenseId && item.catId === catId,
    );

    if (!current) {
      return rejectWithValue('Expense not found.');
    }

    dispatch(removeExpense({ id: expenseId }));

    try {
      await deleteDoc(getExpenseDocRef(householdId, catId, expenseId));
      return { id: expenseId };
    } catch (error) {
      dispatch(revertExpense({ id: expenseId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete expense.',
      );
    }
  },
);
