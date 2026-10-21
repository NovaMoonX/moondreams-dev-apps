import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { runInChunks } from '@apps/pinch/store/actions/containerActions';
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
}

/** One batch, so a package added with others lands whole or not at all, and it queues where the signal drops. */
export const writePackages = createAsyncThunk<
  string[],
  WritePackagesInput,
  { rejectValue: string }
>('pinch/packages/write', async ({ uid, packages }, { rejectWithValue }) => {
  try {
    const batch = writeBatch(db);
    packages.forEach((pkg) => batch.set(packageDoc(uid, pkg.id), pkg));
    await batch.commit();
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }

  return packages.map((pkg) => pkg.id);
});

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
}

interface TakeFromResult {
  changed: ChangedPackage[];
  /** Takes whose package was gone, finished or had less left than planned by the time it was read. */
  skipped: number;
  error: string | null;
}

/** What cooking takes out of the pantry: each planned take re-read inside its chunk's transaction and applied as a use of what is still there (never more than is left); a package that is gone or finished by then is left alone. */
export const takeFromPackages = createAsyncThunk<
  TakeFromResult,
  TakeFromInput,
  { rejectValue: string }
>('pinch/packages/take', async ({ uid, takes }, { rejectWithValue }) => {
  const { done, error } = await runInChunks(
    takes,
    (chunk): Promise<{ changed: ChangedPackage[]; skipped: number }[]> =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map((take) => transaction.get(packageDoc(uid, take.packageId))),
        );
        const now = Date.now();
        const writes = chunk.flatMap((take, index) => {
          const snapshot = snapshots[index];
          if (!snapshot.exists()) return [];

          const pkg = snapshot.data() as Package;
          const plan = planUse(
            pkg,
            take.isAll ? 'ALL' : Math.min(take.amount, pkg.amount),
            now,
          );
          return 'fields' in plan
            ? [{ ref: snapshot.ref, fields: plan.fields }]
            : [];
        });
        writes.forEach(({ ref, fields }) => transaction.update(ref, fields));
        return [
          {
            changed: writes.map(({ ref, fields }) => ({
              id: ref.id,
              at: fields.updatedAt,
              before: null,
            })),
            skipped: chunk.length - writes.length,
          },
        ];
      }),
  );
  const changed = done.flatMap((entry) => entry.changed);
  const skipped = done.reduce((sum, entry) => sum + entry.skipped, 0);
  if (error === null) return { changed, skipped, error: null };
  if (changed.length === 0) {
    return rejectWithValue(getWriteMessage(error, "Couldn't take that out."));
  }

  return {
    changed,
    skipped,
    error: `${changed.length} taken out before it stopped. ${getWriteMessage(error, 'The rest are as they were.')}`,
  };
});

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
