import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  deleteDoc,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_SHOPPING_AMOUNT,
  MAX_SHOPPING_LINES_PER_ADD,
  SHOPPING_BATCH_SIZE,
  UNITS,
} from '@apps/pinch/constants';
import type { ShoppingItem, Unit } from '@apps/pinch/types';
import {
  getShoppingItemId,
  mergeLines,
  roundAmount,
  type ShoppingLine,
} from '@apps/pinch/utils/shopping';

const shoppingDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'shoppingItems', id);

const lineDoc = (uid: string, line: ShoppingLine) =>
  shoppingDoc(uid, getShoppingItemId(line.ingredientId, line.unit));

const isValidAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0 && amount <= MAX_SHOPPING_AMOUNT;

const isValidLine = (line: ShoppingLine) =>
  line.ingredientId !== '' &&
  line.ingredientId.length <= 80 &&
  UNITS.includes(line.unit) &&
  isValidAmount(line.amount);

const BAD_AMOUNT = 'Enter an amount above zero.';

/** A Firebase error is logged and replaced by the fallback; our own sentences are shown as written. */
const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch shopping list write failed', error);
    return fallback;
  }
  return getErrorMessage(error, fallback);
};

/** An item already checked off starts again with the new amount instead of adding to it. */
function writeLine(
  transaction: Transaction,
  line: ShoppingLine,
  snapshot: DocumentSnapshot,
  now: number,
) {
  if (!snapshot.exists()) {
    const item: ShoppingItem = {
      id: snapshot.id,
      ingredientId: line.ingredientId,
      amount: line.amount,
      unit: line.unit,
      isChecked: false,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(snapshot.ref, item);
    return;
  }

  const existing = snapshot.data() as ShoppingItem;
  transaction.update(
    snapshot.ref,
    existing.isChecked
      ? { amount: line.amount, isChecked: false, updatedAt: now }
      : {
          amount: Math.min(
            roundAmount(existing.amount + line.amount),
            MAX_SHOPPING_AMOUNT,
          ),
          updatedAt: now,
        },
  );
}

interface AddToShoppingListInput {
  uid: string;
  lines: ShoppingLine[];
}

/** One transaction reads every target first, so two devices adding at once never lose an amount. */
export const addToShoppingList = createAsyncThunk<
  number,
  AddToShoppingListInput,
  { rejectValue: string }
>(
  'pinch/shopping/add',
  async ({ uid, lines: requested }, { rejectWithValue }) => {
    const lines = mergeLines(requested);
    if (lines.length === 0) {
      return rejectWithValue('Pick something to add.');
    }
    if (lines.length > MAX_SHOPPING_LINES_PER_ADD) {
      return rejectWithValue(
        `Add up to ${MAX_SHOPPING_LINES_PER_ADD} things at a time.`,
      );
    }
    if (!lines.every(isValidLine)) {
      return rejectWithValue(
        'One of these amounts is off. Check it and try again.',
      );
    }

    try {
      await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          lines.map((line) => transaction.get(lineDoc(uid, line))),
        );
        const now = Date.now();
        lines.forEach((line, index) =>
          writeLine(transaction, line, snapshots[index], now),
        );
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to add to your shopping list.'),
      );
    }

    return lines.length;
  },
);

interface SetShoppingItemCheckedInput {
  uid: string;
  id: string;
  isChecked: boolean;
}

export const setShoppingItemChecked = createAsyncThunk<
  void,
  SetShoppingItemCheckedInput,
  { rejectValue: string }
>(
  'pinch/shopping/setChecked',
  async ({ uid, id, isChecked }, { rejectWithValue }) => {
    try {
      await updateDoc(shoppingDoc(uid, id), {
        isChecked,
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to update your shopping list.'),
      );
    }
  },
);

interface UpdateShoppingItemInput {
  uid: string;
  item: Pick<ShoppingItem, 'id' | 'ingredientId' | 'unit'>;
  amount: number;
  unit: Unit;
}

/** A different unit is a different item, so changing it moves the amount in one transaction. */
export const updateShoppingItem = createAsyncThunk<
  void,
  UpdateShoppingItemInput,
  { rejectValue: string }
>(
  'pinch/shopping/update',
  async ({ uid, item, amount: typed, unit }, { rejectWithValue }) => {
    const amount = roundAmount(typed);
    if (!isValidAmount(amount) || !UNITS.includes(unit)) {
      return rejectWithValue(BAD_AMOUNT);
    }

    try {
      if (unit === item.unit) {
        await updateDoc(shoppingDoc(uid, item.id), {
          amount,
          updatedAt: Date.now(),
        });
        return;
      }

      const line: ShoppingLine = {
        ingredientId: item.ingredientId,
        amount,
        unit,
      };
      await runTransaction(db, async (transaction) => {
        const [current, target] = await Promise.all([
          transaction.get(shoppingDoc(uid, item.id)),
          transaction.get(lineDoc(uid, line)),
        ]);
        if (!current.exists()) {
          throw new Error('This is already off your list.');
        }
        transaction.delete(current.ref);
        writeLine(transaction, line, target, Date.now());
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this change.'),
      );
    }
  },
);

interface RemoveShoppingItemInput {
  uid: string;
  id: string;
}

export const removeShoppingItem = createAsyncThunk<
  void,
  RemoveShoppingItemInput,
  { rejectValue: string }
>('pinch/shopping/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(shoppingDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to take this off your list.'),
    );
  }
});

interface ClearCheckedInput {
  uid: string;
}

/** Deletes the items checked off when it is tapped, in batches under the write limit. */
export const clearCheckedShoppingItems = createAsyncThunk<
  number,
  ClearCheckedInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/shopping/clearChecked',
  async ({ uid }, { getState, rejectWithValue }) => {
    const checked = getState().pinch.shopping.items.filter(
      (item) => item.isChecked,
    );
    const groups = Array.from(
      { length: Math.ceil(checked.length / SHOPPING_BATCH_SIZE) },
      (_, index) =>
        checked.slice(
          index * SHOPPING_BATCH_SIZE,
          (index + 1) * SHOPPING_BATCH_SIZE,
        ),
    );

    try {
      await Promise.all(
        groups.map((group) => {
          const batch = writeBatch(db);
          group.forEach((item) => batch.delete(shoppingDoc(uid, item.id)));
          return batch.commit();
        }),
      );
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to clear what you got.'),
      );
    }

    return checked.length;
  },
);
