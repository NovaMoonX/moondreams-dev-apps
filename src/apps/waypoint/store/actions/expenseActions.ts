import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, deleteField, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  EarlyPayment,
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
    earlyPayments: {},
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
  /** Only meaningful when keeping the expense as an estimated range — a paid-amount override
   * shown alongside the range instead of replacing it. */
  paidAmount: number | null;
  /** Only meaningful for a range expense — converts it to a known-amount expense, clearing
   * amountMin/amountMax. This is the default path from the mark-paid modal. */
  knownAmount: number | null;
}

export const markExpensePaid = createAsyncThunk<TripExpense, MarkExpensePaidInput>(
  'waypoint/expenses/markPaid',
  async ({ expense, payerUid, paidAmount, knownAmount }) => {
    // Only the fields this action owns are written — a whole-document write would clobber
    // a debtor's concurrent repaid toggle held in `paidMemberStatus`.
    const changes = {
      status: 'PAID' as const,
      payerUid,
      amount: knownAmount ?? expense.amount,
      amountMin: knownAmount !== null ? null : expense.amountMin,
      amountMax: knownAmount !== null ? null : expense.amountMax,
      paidAmount: knownAmount === null && expense.amount === null ? paidAmount : null,
      lastEditedAt: Date.now(),
    };

    await updateDoc(
      doc(db, 'apps', 'waypoint', 'trips', expense.tripId, 'expenses', expense.id),
      changes,
    );
    const updatedExpense: TripExpense = { ...expense, ...changes };
    return updatedExpense;
  },
);

interface ToggleExpenseRepaidInput {
  uid: string;
  tripId: string;
  expenseId: string;
}

// Each debtor toggles only their own key, so — like markEventSeen — this must
// read-modify-write inside a transaction to avoid clobbering a concurrent toggle.
export const toggleExpenseRepaid = createAsyncThunk<void, ToggleExpenseRepaidInput>(
  'waypoint/expenses/toggleRepaid',
  async ({ uid, tripId, expenseId }) => {
    const expenseRef = doc(db, 'apps', 'waypoint', 'trips', tripId, 'expenses', expenseId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(expenseRef);
      if (!snapshot.exists()) {
        return;
      }
      const paidMemberStatus = (snapshot.data().paidMemberStatus ?? {}) as TripExpense['paidMemberStatus'];
      const wasPaid = paidMemberStatus[uid]?.isPaid ?? false;
      transaction.update(expenseRef, {
        paidMemberStatus: {
          ...paidMemberStatus,
          [uid]: { isPaid: !wasPaid, paidAt: wasPaid ? null : Date.now() },
        },
      });
    });
  },
);

const getExpenseRef = (tripId: string, expenseId: string) =>
  doc(db, 'apps', 'waypoint', 'trips', tripId, 'expenses', expenseId);

interface EarlyPaymentTarget {
  uid: string;
  tripId: string;
  expenseId: string;
}

interface SetEarlyPaymentInput extends EarlyPaymentTarget {
  toUid: string;
  amount: number;
}

// Each member writes only their own key, with a dotted path, so a teammate's concurrent early
// payment (or an editor's save) is never overwritten.
export const setEarlyPayment = createAsyncThunk<void, SetEarlyPaymentInput, { rejectValue: string }>(
  'waypoint/expenses/setEarlyPayment',
  async ({ uid, tripId, expenseId, toUid, amount }, { rejectWithValue }) => {
    if (toUid === uid) {
      return rejectWithValue('Choose who you paid.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return rejectWithValue('Enter an amount greater than zero.');
    }
    const payment: EarlyPayment = { toUid, amount, paidAt: Date.now(), isReturned: false, returnedAt: null };
    await updateDoc(getExpenseRef(tripId, expenseId), { [`earlyPayments.${uid}`]: payment });
  },
);

export const removeEarlyPayment = createAsyncThunk<void, EarlyPaymentTarget>(
  'waypoint/expenses/removeEarlyPayment',
  async ({ uid, tripId, expenseId }) => {
    await updateDoc(getExpenseRef(tripId, expenseId), { [`earlyPayments.${uid}`]: deleteField() });
  },
);

interface SetEarlyPaymentReturnedInput extends EarlyPaymentTarget {
  isReturned: boolean;
}

export const setEarlyPaymentReturned = createAsyncThunk<void, SetEarlyPaymentReturnedInput>(
  'waypoint/expenses/setEarlyPaymentReturned',
  async ({ uid, tripId, expenseId, isReturned }) => {
    await updateDoc(getExpenseRef(tripId, expenseId), {
      [`earlyPayments.${uid}.isReturned`]: isReturned,
      [`earlyPayments.${uid}.returnedAt`]: isReturned ? Date.now() : null,
    });
  },
);
