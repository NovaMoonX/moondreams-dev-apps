import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, deleteField, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  EarlyPayment,
  ExpenseCategory,
  ExpenseLink,
  ExpenseStatus,
  ExpenseTargetType,
  PersonalExpense,
  TripExpense,
} from '@apps/waypoint/types';

const getExpenseRef = (tripId: string, expenseId: string) =>
  doc(db, 'apps', 'waypoint', 'trips', tripId, 'expenses', expenseId);

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
  linkedTo: ExpenseLink | null;
  split: { targetType: 'EVERYONE_CURRENT' | 'SPECIFIC_MEMBERS'; targetMemberIds: string[] };
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
  const sharedWith = Array.from(new Set(input.split.targetMemberIds.filter((uid) => input.memberIds.includes(uid))));
  if (input.split.targetType === 'SPECIFIC_MEMBERS' && sharedWith.length === 0) {
    return rejectWithValue('Pick at least one person on the trip to share it.');
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
    targetType: input.split.targetType,
    targetMemberIds: input.split.targetType === 'EVERYONE_CURRENT' ? input.memberIds : sharedWith,
    splitAmounts: null,
    paidMemberStatus,
    earlyPayments: {},
    note: input.note?.trim() || null,
    groupLabel: input.groupLabel?.trim() || null,
    linkedTo: input.linkedTo,
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
  dayIndex: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
  groupLabel: string | null;
  isPerPerson: boolean;
  linkedTo: ExpenseLink | null;
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
  const changes = {
    title,
    amount: input.amount,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    dayIndex: input.dayIndex,
    // A paid-amount override only exists beside an estimated range, so an exact amount clears it.
    ...(input.amount !== null ? { paidAmount: null } : {}),
    category: input.category,
    customCategoryLabel:
      input.category === 'OTHER' ? input.customCategoryLabel?.trim() || null : null,
    note: input.note?.trim() || null,
    groupLabel: input.groupLabel?.trim() || null,
    isPerPerson: input.isPerPerson,
    linkedTo: input.linkedTo,
    lastEditedAt: Date.now(),
  };

  await updateDoc(
    doc(db, 'apps', 'waypoint', 'trips', input.expense.tripId, 'expenses', input.expense.id),
    changes,
  );
  return { ...input.expense, ...changes };
});

interface LinkExpenseInput {
  expense: TripExpense;
  link: ExpenseLink;
  /** The plan's day, used only when the expense has none of its own. */
  dayIndex: number | null;
}

/** Attaches an expense to a plan without changing anything it already has; a day it lacks is filled in from the plan. */
export const linkExpenseToPlan = createAsyncThunk<TripExpense, LinkExpenseInput>(
  'waypoint/expenses/link',
  async ({ expense, link, dayIndex }) => {
    const expenseRef = doc(db, 'apps', 'waypoint', 'trips', expense.tripId, 'expenses', expense.id);
    const linked = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(expenseRef);
      if (!snapshot.exists()) {
        throw new Error('This expense was removed.');
      }
      const current = snapshot.data() as Partial<TripExpense>;
      if (current.linkedTo) {
        throw new Error('This expense is already linked to a plan.');
      }
      const changes = { linkedTo: link, dayIndex: current.dayIndex ?? dayIndex, lastEditedAt: Date.now() };
      transaction.update(expenseRef, changes);
      return { ...expense, ...changes };
    });
    return linked;
  },
);

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
    linkedTo: input.expense.linkedTo,
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
    const expenseRef = getExpenseRef(expense.tripId, expense.id);
    // Re-read inside the transaction so a second person tapping Mark paid, or an edit that
    // changed the amount, is never overwritten from a stale copy.
    const updatedExpense = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(expenseRef);
      if (!snapshot.exists()) {
        throw new Error('This expense no longer exists.');
      }
      const current = snapshot.data() as TripExpense;
      if (current.status === 'PAID') {
        throw new Error('Someone already marked this as paid.');
      }
      if ((current.amount === null) !== (expense.amount === null)) {
        throw new Error('The amount was changed while you were paying. Close this and try again.');
      }
      const changes = {
        status: 'PAID' as const,
        payerUid,
        amount: knownAmount ?? current.amount,
        amountMin: knownAmount !== null ? null : current.amountMin,
        amountMax: knownAmount !== null ? null : current.amountMax,
        paidAmount: knownAmount === null && current.amount === null ? paidAmount : null,
        lastEditedAt: Date.now(),
      };
      transaction.update(expenseRef, changes);
      return { ...current, ...changes } as TripExpense;
    });
    return updatedExpense;
  },
);

/** Puts a paid expense back to expected, clearing everyone's "repaid" marks so paying it again starts clean. */
export const markExpenseUnpaid = createAsyncThunk<TripExpense, { expense: TripExpense }>(
  'waypoint/expenses/markUnpaid',
  async ({ expense }) => {
    const expenseRef = getExpenseRef(expense.tripId, expense.id);
    const updatedExpense = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(expenseRef);
      if (!snapshot.exists()) {
        throw new Error('This expense no longer exists.');
      }
      const current = snapshot.data() as TripExpense;
      if (current.status !== 'PAID') {
        throw new Error('This was already marked as unpaid.');
      }
      const changes = {
        status: 'EXPECTED' as const,
        payerUid: null,
        paidAmount: null,
        paidMemberStatus: Object.fromEntries(
          Object.keys(current.paidMemberStatus ?? {}).map((uid) => [uid, { isPaid: false, paidAt: null }]),
        ),
        lastEditedAt: Date.now(),
      };
      transaction.update(expenseRef, changes);
      return { ...current, ...changes } as TripExpense;
    });
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

interface EarlyPaymentTarget {
  uid: string;
  tripId: string;
  expenseId: string;
}

interface SetEarlyPaymentInput extends EarlyPaymentTarget {
  toUid: string;
  amount: number;
}

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

interface SavePersonalExpenseInput {
  uid: string;
  tripId: string;
  title: string;
  amount: number;
  status: ExpenseStatus;
  dayIndex: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
}

type PersonalExpenseFields = Omit<SavePersonalExpenseInput, 'uid' | 'tripId'>;

const personalExpensesRef = (uid: string) => collection(db, 'apps', 'waypoint', 'personalExpenses', uid, 'items');

function getPersonalExpenseFields(input: PersonalExpenseFields): PersonalExpenseFields | string {
  const title = input.title.trim();
  if (!title) {
    return 'A title is required.';
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return 'Enter a valid amount.';
  }
  return { ...input, title, amount: Math.round(input.amount * 100) / 100, note: input.note?.trim() || null };
}

export const createPersonalExpense = createAsyncThunk<
  PersonalExpense,
  SavePersonalExpenseInput,
  { rejectValue: string }
>('waypoint/personalExpenses/create', async ({ uid, tripId, ...input }, { rejectWithValue }) => {
  const fields = getPersonalExpenseFields(input);
  if (typeof fields === 'string') {
    return rejectWithValue(fields);
  }

  const expenseRef = doc(personalExpensesRef(uid));
  const now = Date.now();
  const expense: PersonalExpense = {
    ...fields,
    id: expenseRef.id,
    tripId,
    currency: 'USD',
    createdAt: now,
    lastEditedAt: now,
  };
  await setDoc(expenseRef, expense);
  return expense;
});

export const setPersonalExpenseStatus = createAsyncThunk<void, { uid: string; expenseId: string; status: ExpenseStatus }>(
  'waypoint/personalExpenses/setStatus',
  async ({ uid, expenseId, status }) => {
    await updateDoc(doc(personalExpensesRef(uid), expenseId), { status, lastEditedAt: Date.now() });
  },
);

export const updatePersonalExpense = createAsyncThunk<
  void,
  { uid: string; expenseId: string } & PersonalExpenseFields,
  { rejectValue: string }
>('waypoint/personalExpenses/update', async ({ uid, expenseId, ...input }, { rejectWithValue }) => {
  const fields = getPersonalExpenseFields(input);
  if (typeof fields === 'string') {
    return rejectWithValue(fields);
  }

  await updateDoc(doc(personalExpensesRef(uid), expenseId), { ...fields, lastEditedAt: Date.now() });
});

export const deletePersonalExpense = createAsyncThunk<void, { uid: string; expenseId: string }>(
  'waypoint/personalExpenses/delete',
  async ({ uid, expenseId }) => {
    await deleteDoc(doc(personalExpensesRef(uid), expenseId));
  },
);
