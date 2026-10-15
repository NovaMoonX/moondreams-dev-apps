import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
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
  MAX_SHOPPING_LINES_PER_ADD,
  SHOPPING_BATCH_SIZE,
  UNITS,
} from '@apps/pinch/constants';
import type { ShoppingItem, Unit } from '@apps/pinch/types';
import {
  getMergedFields,
  getShoppingItemId,
  isValidAmount,
  mergeLines,
  roundAmount,
  type ShoppingLine,
} from '@apps/pinch/utils/shopping';

const shoppingDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'shoppingItems', id);

const lineDoc = (uid: string, line: ShoppingLine) =>
  shoppingDoc(uid, getShoppingItemId(line.ingredientId, line.unit));

const isValidLine = (line: ShoppingLine) =>
  line.ingredientId !== '' &&
  line.ingredientId.length <= 80 &&
  UNITS.includes(line.unit) &&
  isValidAmount(line.amount);

const BAD_AMOUNT = 'Enter an amount above zero.';
const OFFLINE_MESSAGE = 'Check your connection and try again.';

/** A Firebase error is logged and replaced by one sentence; our own sentences are shown as written. */
const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch shopping list write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

function writeLine(
  transaction: Transaction,
  line: ShoppingLine,
  snapshot: DocumentSnapshot,
  now: number,
  isChecked = false,
) {
  const existing = snapshot.exists() ? (snapshot.data() as ShoppingItem) : null;
  const fields = getMergedFields(existing, line, now, isChecked);
  if (existing) {
    transaction.update(snapshot.ref, { ...fields });
    return;
  }

  const item: ShoppingItem = {
    id: snapshot.id,
    ingredientId: line.ingredientId,
    unit: line.unit,
    createdAt: now,
    ...fields,
  };
  transaction.set(snapshot.ref, item);
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
  /** Every stored item behind one row of the list. */
  ids: string[];
  isChecked: boolean;
}

/** A field-scoped batch, so a tick queues offline like a single update would. */
export const setShoppingItemChecked = createAsyncThunk<
  void,
  SetShoppingItemCheckedInput,
  { rejectValue: string }
>(
  'pinch/shopping/setChecked',
  async ({ uid, ids, isChecked }, { rejectWithValue }) => {
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      ids.forEach((id) =>
        batch.update(shoppingDoc(uid, id), { isChecked, updatedAt: now }),
      );
      await batch.commit();
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
  /** The other items the row showed as one amount with this one; saving keeps only the amount typed. */
  mergedIds?: string[];
  amount: number;
  unit: Unit;
}

/** A different unit is a different item, so changing it, or folding a row's items into one, moves the amount in one transaction. */
export const updateShoppingItem = createAsyncThunk<
  void,
  UpdateShoppingItemInput,
  { rejectValue: string }
>(
  'pinch/shopping/update',
  async (
    { uid, item, mergedIds = [], amount: typed, unit },
    { rejectWithValue },
  ) => {
    const amount = roundAmount(typed);
    if (!isValidAmount(amount) || !UNITS.includes(unit)) {
      return rejectWithValue(BAD_AMOUNT);
    }

    try {
      if (unit === item.unit && mergedIds.length === 0) {
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
      const targetId = getShoppingItemId(item.ingredientId, unit);
      const rowIds = [item.id, ...mergedIds];
      await runTransaction(db, async (transaction) => {
        const [current, target, ...merged] = await Promise.all([
          transaction.get(shoppingDoc(uid, item.id)),
          transaction.get(lineDoc(uid, line)),
          ...mergedIds.map((id) => transaction.get(shoppingDoc(uid, id))),
        ]);
        if (!current.exists()) {
          throw new Error('This is already off your list.');
        }
        const isChecked = (current.data() as ShoppingItem).isChecked;
        const now = Date.now();
        [current, ...merged]
          .filter((snapshot) => snapshot.exists() && snapshot.id !== targetId)
          .forEach((snapshot) => transaction.delete(snapshot.ref));
        if (rowIds.includes(targetId) && target.exists()) {
          transaction.update(target.ref, { amount, isChecked, updatedAt: now });
          return;
        }
        writeLine(transaction, line, target, now, isChecked);
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
  /** Every stored item behind one row of the list. */
  ids: string[];
}

export const removeShoppingItem = createAsyncThunk<
  void,
  RemoveShoppingItemInput,
  { rejectValue: string }
>('pinch/shopping/remove', async ({ uid, ids }, { rejectWithValue }) => {
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(shoppingDoc(uid, id)));
    await batch.commit();
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to take this off your list.'),
    );
  }
});

interface ClearCheckedInput {
  uid: string;
}

const toChunks = <T>(list: T[]) =>
  Array.from(
    { length: Math.ceil(list.length / SHOPPING_BATCH_SIZE) },
    (_, index) =>
      list.slice(
        index * SHOPPING_BATCH_SIZE,
        (index + 1) * SHOPPING_BATCH_SIZE,
      ),
  );

/** Resolves to the items it deleted, as they were, for an Undo; fewer than were ticked at the tap when another device un-ticked or removed one. */
export const clearCheckedShoppingItems = createAsyncThunk<
  ShoppingItem[],
  ClearCheckedInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/shopping/clearChecked',
  async ({ uid }, { getState, rejectWithValue }) => {
    const ids = getState()
      .pinch.shopping.items.filter((item) => item.isChecked)
      .map((item) => item.id);

    try {
      // Each chunk is its own transaction, so one that fails leaves the others cleared.
      const cleared = await Promise.all(
        toChunks(ids).map((chunk) =>
          runTransaction(db, async (transaction) => {
            const snapshots = await Promise.all(
              chunk.map((id) => transaction.get(shoppingDoc(uid, id))),
            );
            const stillChecked = snapshots.filter(
              (snapshot) => snapshot.data()?.isChecked === true,
            );
            stillChecked.forEach((snapshot) =>
              transaction.delete(snapshot.ref),
            );
            return stillChecked.map(
              (snapshot) => snapshot.data() as ShoppingItem,
            );
          }),
        ),
      );

      return cleared.flat();
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to clear what you got.'),
      );
    }
  },
);

interface RestoreShoppingItemsInput {
  uid: string;
  items: ShoppingItem[];
}

/** Undoes a removal or a clear: puts each item back as it was, ticked or not, unless it is on the list again by then, which keeps what it has. Resolves to how many it put back. */
export const restoreShoppingItems = createAsyncThunk<
  number,
  RestoreShoppingItemsInput,
  { rejectValue: string }
>('pinch/shopping/restore', async ({ uid, items }, { rejectWithValue }) => {
  try {
    const counts = await Promise.all(
      toChunks(items).map((chunk) =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((item) => transaction.get(shoppingDoc(uid, item.id))),
          );
          const now = Date.now();
          const missing = chunk.filter(
            (_, index) => !snapshots[index].exists(),
          );
          missing.forEach((item) =>
            transaction.set(shoppingDoc(uid, item.id), {
              id: item.id,
              ingredientId: item.ingredientId,
              amount: item.amount,
              unit: item.unit,
              isChecked: item.isChecked,
              createdAt: item.createdAt,
              updatedAt: now,
            } satisfies ShoppingItem),
          );
          return missing.length;
        }),
      ),
    );

    return counts.reduce((sum, count) => sum + count, 0);
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, "Couldn't put that back on your list."),
    );
  }
});
