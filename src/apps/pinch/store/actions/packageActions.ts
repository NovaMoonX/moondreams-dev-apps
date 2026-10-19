import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import {
  deleteDoc,
  doc,
  increment,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { runInChunks } from '@apps/pinch/store/actions/containerActions';
import { selectPackagesById } from '@apps/pinch/store/selectors';
import type { Package, PackagePlace } from '@apps/pinch/types';
import {
  NO_PACKAGE_SKIPS,
  planPackageBulk,
  planPackageEdit,
  planPackageMove,
  planPackageToss,
  planUndoEnd,
  planUndoPackageMove,
  planUse,
  type PackageBefore,
  type PackageBulkAction,
  type PackageEdit,
  type PackagePlan,
  type PackageSkipCounts,
  type PackageTake,
} from '@apps/pinch/utils/packages';

const packageDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'packages', id);

const OFFLINE_MESSAGE = 'Check your connection and try again.';
const GONE = 'This package is gone, so nothing was changed.';
export const TAKE_REFUSED =
  'They were used or finished somewhere else, so nothing was taken.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch package write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

/** Reads the package inside the transaction and writes only the fields the plan changes, so another device's change is never written over. */
const applyPlan = (
  uid: string,
  id: string,
  getPlan: (pkg: Package, now: number) => PackagePlan,
) =>
  runTransaction(db, async (transaction) => {
    const ref = packageDoc(uid, id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(GONE);

    const plan = getPlan(snapshot.data() as Package, Date.now());
    if ('error' in plan) throw new Error(plan.error);

    transaction.update(ref, plan.fields);
    return { fields: plan.fields, read: snapshot.data() as Package };
  });

interface WritePackagesInput {
  uid: string;
  packages: Package[];
  /** Shopping lines these packages put away, each with the `updatedAt` it had. */
  putAway?: { id: string; updatedAt: number }[];
}

const shoppingDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'shoppingItems', id);

/** A field-scoped update on its own, never in the packages' batch: a line another device already cleared would refuse the whole batch. Its failure is logged and changes nothing the person sees. */
const stampLine = (uid: string, id: string, pantryAddedAt: number | null) =>
  updateDoc(shoppingDoc(uid, id), { pantryAddedAt }).catch((error: unknown) =>
    console.error('Pinch shopping line not marked', error),
  );

/** One batch, so a package added with others lands whole or not at all, and it queues where the signal drops. The lines it put away are stamped at once, so another device stops offering them without waiting for the server, and are un-stamped if the batch is refused. */
export const writePackages = createAsyncThunk<
  string[],
  WritePackagesInput,
  { rejectValue: string }
>(
  'pinch/packages/write',
  async ({ uid, packages, putAway = [] }, { rejectWithValue }) => {
    putAway.forEach(({ id, updatedAt }) => void stampLine(uid, id, updatedAt));
    try {
      const batch = writeBatch(db);
      packages.forEach((pkg) => batch.set(packageDoc(uid, pkg.id), pkg));
      await batch.commit();
    } catch (error) {
      putAway.forEach(({ id }) => void stampLine(uid, id, null));
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }

    return packages.map((pkg) => pkg.id);
  },
);

interface ChangeInput {
  uid: string;
  id: string;
}

/** Takes back an add only while the package has not been touched since it was written. */
export const undoPackageAdd = createAsyncThunk<
  string,
  ChangeInput,
  { rejectValue: string }
>('pinch/packages/undoAdd', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(packageDoc(uid, id));
      if (!snapshot.exists()) return;

      const pkg = snapshot.data() as Package;
      if (pkg.updatedAt !== pkg.createdAt) {
        throw new Error('It has changed since, so it was left as it is.');
      }
      transaction.delete(snapshot.ref);
    });
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, "Couldn't undo that."));
  }

  return id;
});

interface ChangeResult {
  at: number;
  isFinished: boolean;
  amountLeft: number | null;
}

/** `amount` is how much was used; `ALL` uses what is left when the transaction reads it. */
export const consumePackage = createAsyncThunk<
  ChangeResult,
  ChangeInput & { amount: number | 'ALL' },
  { rejectValue: string }
>(
  'pinch/packages/consume',
  async ({ uid, id, amount }, { rejectWithValue }) => {
    try {
      const { fields } = await applyPlan(uid, id, (pkg, now) =>
        planUse(pkg, amount, now),
      );
      return {
        at: fields.updatedAt,
        isFinished: fields.status === 'DONE',
        amountLeft: fields.status === 'DONE' ? null : (fields.amount ?? null),
      };
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }
  },
);

export const tossPackage = createAsyncThunk<
  { at: number },
  ChangeInput,
  { rejectValue: string }
>('pinch/packages/toss', async ({ uid, id }, { rejectWithValue }) => {
  try {
    const { fields } = await applyPlan(uid, id, planPackageToss);
    return { at: fields.updatedAt };
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }
});

export const undoPackageEnd = createAsyncThunk<
  string,
  ChangeInput & { at: number },
  { rejectValue: string }
>('pinch/packages/undoEnd', async ({ uid, id, at }, { rejectWithValue }) => {
  try {
    await applyPlan(uid, id, (pkg, now) => planUndoEnd(pkg, at, now));
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, "Couldn't undo that."));
  }

  return id;
});

/** A moved package's date is kept unless `expiresAt` is given; `null` clears it. */
export const movePackage = createAsyncThunk<
  { at: number; before: PackageBefore },
  ChangeInput & { to: PackagePlace; expiresAt?: number | null },
  { rejectValue: string }
>(
  'pinch/packages/move',
  async ({ uid, id, to, expiresAt }, { rejectWithValue }) => {
    try {
      const { fields, read } = await applyPlan(uid, id, (pkg, now) =>
        planPackageMove(pkg, to, expiresAt, now),
      );
      return {
        at: fields.updatedAt,
        before: { place: read.place, expiresAt: read.expiresAt },
      };
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }
  },
);

/** The fields the edit form owns, re-read inside the transaction: the history is capped, so an entry can't be appended blind. */
export const editPackage = createAsyncThunk<
  string,
  ChangeInput & { edit: PackageEdit },
  { rejectValue: string }
>('pinch/packages/edit', async ({ uid, id, edit }, { rejectWithValue }) => {
  try {
    await applyPlan(uid, id, (pkg, now) => planPackageEdit(pkg, edit, now));
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }

  return id;
});

export const removePackage = createAsyncThunk<
  string,
  ChangeInput,
  { rejectValue: string }
>('pinch/packages/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(packageDoc(uid, id));
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to delete this.'));
  }

  return id;
});

export interface ChangedPackage {
  id: string;
  at: number;
  /** A moved package's place and date before the move, which its Undo puts back. */
  before: PackageBefore | null;
}

interface ChangeInPlaceInput {
  uid: string;
  ids: string[];
  action: PackageBulkAction;
}

interface ChangeInPlaceResult {
  changed: ChangedPackage[];
  skipped: PackageSkipCounts;
  /** Set when a later chunk failed after earlier ones were written. */
  error: string | null;
}

const addCounts = (
  a: PackageSkipCounts,
  b: PackageSkipCounts,
): PackageSkipCounts => ({
  GONE: a.GONE + b.GONE,
  FINISHED: a.FINISHED + b.FINISHED,
  REDATED: a.REDATED + b.REDATED,
  SAME_PLACE: a.SAME_PLACE + b.SAME_PLACE,
});

/** Applies one act (toss, use up, move) to every package among `ids` that is still as the screen thought, each chunk re-read inside its own transaction; resolves to the packages it really changed and why it left the others. */
export const changePackagesInPlace = createAsyncThunk<
  ChangeInPlaceResult,
  ChangeInPlaceInput,
  { rejectValue: string }
>(
  'pinch/packages/changeInPlace',
  async ({ uid, ids, action }, { rejectWithValue }) => {
    const { done, error } = await runInChunks(
      ids,
      (
        chunk,
      ): Promise<{ changed: ChangedPackage[]; skipped: PackageSkipCounts }[]> =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((id) => transaction.get(packageDoc(uid, id))),
          );
          const { writes, skipped } = planPackageBulk(
            snapshots.map((snapshot) =>
              snapshot.exists() ? (snapshot.data() as Package) : null,
            ),
            action,
            Date.now(),
          );
          writes.forEach(({ id, fields }) =>
            transaction.update(packageDoc(uid, id), fields),
          );
          return [
            {
              changed: writes.map(({ id, fields, before }) => ({
                id,
                at: fields.updatedAt,
                before,
              })),
              skipped,
            },
          ];
        }),
    );
    const changed = done.flatMap((entry) => entry.changed);
    const skipped = done.reduce(
      (counts, entry) => addCounts(counts, entry.skipped),
      NO_PACKAGE_SKIPS,
    );
    if (error === null) return { changed, skipped, error: null };
    if (changed.length === 0) {
      return rejectWithValue(getWriteMessage(error, "Couldn't save that."));
    }

    return {
      changed,
      skipped,
      error: `${changed.length} changed before it stopped. ${getWriteMessage(error, 'The rest are as they were.')}`,
    };
  },
);

interface TakeFromInput {
  uid: string;
  takes: PackageTake[];
  /** Runs when the server refuses the batch, which offline can be long after the thunk resolved. */
  onRefused: (message: string) => void;
}

interface TakeFromResult {
  changed: ChangedPackage[];
  /** Takes whose package was no longer in the loaded pantry or was finished. */
  skipped: number;
}

/** What cooking takes out of the pantry, written as one local-first batch from the loaded packages: a partial take is an `increment`, so another device's use of the same package is kept, and the history is this device's copy plus the new event. A package that is gone or finished here is left alone. Resolves once the batch is queued, not when the server answers. */
export const takeFromPackages = createAsyncThunk<
  TakeFromResult,
  TakeFromInput,
  { rejectValue: string }
>(
  'pinch/packages/take',
  async ({ uid, takes, onRefused }, { getState, rejectWithValue }) => {
    try {
      const loaded = selectPackagesById(getState() as RootState);
      const now = Date.now();
      const writes = takes.flatMap((take) => {
        const pkg = loaded.get(take.packageId);
        if (!pkg) return [];

        const used = take.isAll
          ? pkg.amount
          : Math.min(take.amount, pkg.amount);
        const plan = planUse(pkg, take.isAll ? 'ALL' : used, now);
        if (!('fields' in plan)) return [];

        const { amount, ...rest } = plan.fields;
        return [
          {
            id: pkg.id,
            fields:
              amount === undefined
                ? rest
                : { ...rest, amount: increment(-used) },
          },
        ];
      });
      if (writes.length > 0) {
        const batch = writeBatch(db);
        writes.forEach(({ id, fields }) =>
          batch.update(packageDoc(uid, id), fields),
        );
        batch
          .commit()
          .catch((error) => onRefused(getWriteMessage(error, TAKE_REFUSED)));
      }

      return {
        changed: writes.map(({ id, fields }) => ({
          id,
          at: fields.updatedAt,
          before: null,
        })),
        skipped: takes.length - writes.length,
      };
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, "Couldn't take that out."));
    }
  },
);

interface UndoChangesInput {
  uid: string;
  changed: ChangedPackage[];
}

interface UndoChangesResult {
  restored: number;
  error: string | null;
}

/** Puts back each changed package whose last event is still that act (a use, a toss or a move); one that changed since is left as it is. */
export const undoPackageChanges = createAsyncThunk<
  UndoChangesResult,
  UndoChangesInput,
  { rejectValue: string }
>(
  'pinch/packages/undoChanges',
  async ({ uid, changed }, { rejectWithValue }) => {
    const { done, error } = await runInChunks(changed, (chunk) =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map(({ id }) => transaction.get(packageDoc(uid, id))),
        );
        const now = Date.now();
        const writes = chunk.flatMap((entry, index) => {
          const snapshot = snapshots[index];
          if (!snapshot.exists()) return [];

          const pkg = snapshot.data() as Package;
          const plan = entry.before
            ? planUndoPackageMove(pkg, entry.at, entry.before, now)
            : planUndoEnd(pkg, entry.at, now);
          return 'fields' in plan
            ? [{ ref: snapshot.ref, fields: plan.fields }]
            : [];
        });
        writes.forEach(({ ref, fields }) => transaction.update(ref, fields));
        return writes.map(({ ref }) => ref.id);
      }),
    );
    if (error === null) return { restored: done.length, error: null };
    if (done.length === 0) {
      return rejectWithValue(getWriteMessage(error, "Couldn't undo that."));
    }

    return {
      restored: done.length,
      error: getWriteMessage(error, 'The rest are as the act left them.'),
    };
  },
);
