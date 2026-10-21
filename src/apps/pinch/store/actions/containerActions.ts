import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { queryClient } from '@/lib/query/queryClient';
import { getErrorMessage } from '@/utils/errorUtils';
import { CONTAINER_CLEAR_CHUNK_SIZE } from '@apps/pinch/constants';
import { containerKeys } from '@apps/pinch/queries/containerQueries';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  NO_SKIPS,
  planBulk,
  planCount,
  planEat,
  planEatBy,
  planMove,
  planToss,
  planUndoEnd,
  planUndoMove,
  type BulkAction,
  type ContainerPlan,
  type SkipCounts,
} from '@apps/pinch/utils/containers';

const containerDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'containers', id);

const OFFLINE_MESSAGE = 'Check your connection and try again.';
const GONE = 'This box is gone, so nothing was changed.';

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch container write failed', error);
    return error.code === 'unavailable' || !navigator.onLine
      ? OFFLINE_MESSAGE
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

const refreshFinished = (uid: string) =>
  queryClient.invalidateQueries({ queryKey: containerKeys.all(uid) });

/** Reads the container inside the transaction, so another device's change is never written over. */
const applyPlan = (
  uid: string,
  id: string,
  getPlan: (container: Container, now: number) => ContainerPlan,
) =>
  runTransaction(db, async (transaction) => {
    const ref = containerDoc(uid, id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(GONE);

    const plan = getPlan(snapshot.data() as Container, Date.now());
    if ('error' in plan) throw new Error(plan.error);

    transaction.update(ref, plan.fields);
    return plan.fields;
  });

/** One plan over every box of a batch in one transaction, so the batch changes whole or not at all. */
const applyPlanToAll = (
  uid: string,
  ids: string[],
  getPlan: (container: Container, now: number) => ContainerPlan,
) =>
  runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(
      ids.map((id) => transaction.get(containerDoc(uid, id))),
    );
    const now = Date.now();
    const writes = snapshots.map((snapshot) => {
      if (!snapshot.exists()) throw new Error(GONE);

      const plan = getPlan(snapshot.data() as Container, now);
      if ('error' in plan) throw new Error(plan.error);
      return { ref: snapshot.ref, fields: plan.fields };
    });
    writes.forEach(({ ref, fields }) => transaction.update(ref, fields));
    return writes.map(({ ref, fields }) => ({
      id: ref.id,
      at: fields.updatedAt,
    }));
  });

interface WriteContainersInput {
  uid: string;
  containers: Container[];
}

/** One batch, so a put-away of several containers lands whole or not at all. */
export const writeContainers = createAsyncThunk<
  string[],
  WriteContainersInput,
  { rejectValue: string }
>(
  'pinch/containers/write',
  async ({ uid, containers }, { rejectWithValue }) => {
    try {
      const batch = writeBatch(db);
      containers.forEach((container) =>
        batch.set(containerDoc(uid, container.id), container),
      );
      await batch.commit();
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }

    return containers.map((container) => container.id);
  },
);

interface UndoBatchInput {
  uid: string;
  ids: string[];
}

/** Takes back a put-away only while none of its containers has been touched since it was written. */
export const undoContainerBatch = createAsyncThunk<
  string[],
  UndoBatchInput,
  { rejectValue: string }
>('pinch/containers/undoBatch', async ({ uid, ids }, { rejectWithValue }) => {
  try {
    await runTransaction(db, async (transaction) => {
      const snapshots = await Promise.all(
        ids.map((id) => transaction.get(containerDoc(uid, id))),
      );
      const existing = snapshots.filter((snapshot) => snapshot.exists());
      const isChanged = existing.some((snapshot) => {
        const container = snapshot.data() as Container;
        return container.updatedAt !== container.createdAt;
      });
      if (isChanged) {
        throw new Error(
          'One of them has changed since, so it was left as it is.',
        );
      }
      existing.forEach((snapshot) => transaction.delete(snapshot.ref));
    });
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, "Couldn't undo that."));
  }

  return ids;
});

interface ChangeInput {
  uid: string;
  id: string;
}

interface ChangeResult {
  at: number;
  isFinished: boolean;
  servingsLeft: number;
}

const toResult = (fields: Awaited<ReturnType<typeof applyPlan>>) => ({
  at: fields.updatedAt,
  isFinished: fields.status === 'DONE',
  servingsLeft: fields.status === 'DONE' ? 0 : (fields.servings ?? 0),
});

/** `ALL` eats what is left when the transaction reads it. */
export const eatContainer = createAsyncThunk<
  ChangeResult,
  ChangeInput & { count: number | 'ALL' },
  { rejectValue: string }
>('pinch/containers/eat', async ({ uid, id, count }, { rejectWithValue }) => {
  try {
    const fields = await applyPlan(uid, id, (container, now) =>
      planEat(container, count, now),
    );
    void refreshFinished(uid);
    return toResult(fields);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }
});

export const tossContainer = createAsyncThunk<
  ChangeResult,
  ChangeInput,
  { rejectValue: string }
>('pinch/containers/toss', async ({ uid, id }, { rejectWithValue }) => {
  try {
    const fields = await applyPlan(uid, id, planToss);
    void refreshFinished(uid);
    return toResult(fields);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }
});

export const undoContainerEnd = createAsyncThunk<
  string,
  ChangeInput & { at: number },
  { rejectValue: string }
>('pinch/containers/undoEnd', async ({ uid, id, at }, { rejectWithValue }) => {
  try {
    await applyPlan(uid, id, (container, now) =>
      planUndoEnd(container, at, now),
    );
    void refreshFinished(uid);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, "Couldn't undo that."));
  }

  return id;
});

export const moveContainer = createAsyncThunk<
  string,
  ChangeInput & { to: ContainerPlace; eatBy: number },
  { rejectValue: string }
>(
  'pinch/containers/move',
  async ({ uid, id, to, eatBy }, { rejectWithValue }) => {
    try {
      await applyPlan(uid, id, (container, now) =>
        planMove(container, to, eatBy, now),
      );
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }

    return id;
  },
);

export const correctContainerCount = createAsyncThunk<
  string,
  ChangeInput & { count: number },
  { rejectValue: string }
>('pinch/containers/count', async ({ uid, id, count }, { rejectWithValue }) => {
  try {
    await applyPlan(uid, id, (container, now) =>
      planCount(container, count, now),
    );
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }

  return id;
});

export const changeContainerEatBy = createAsyncThunk<
  string,
  ChangeInput & { eatBy: number },
  { rejectValue: string }
>('pinch/containers/eatBy', async ({ uid, id, eatBy }, { rejectWithValue }) => {
  try {
    await applyPlan(uid, id, (container, now) =>
      planEatBy(container, eatBy, now),
    );
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
  }

  return id;
});

interface ChunksResult<R> {
  done: R[];
  error: unknown;
}

/** One chunk after another, each its own transaction: a chunk that committed stays committed when a later one fails. */
export const runInChunks = <T, R>(
  items: T[],
  runChunk: (chunk: T[]) => Promise<R[]>,
): Promise<ChunksResult<R>> =>
  Array.from(
    { length: Math.ceil(items.length / CONTAINER_CLEAR_CHUNK_SIZE) },
    (_, index) =>
      items.slice(
        index * CONTAINER_CLEAR_CHUNK_SIZE,
        (index + 1) * CONTAINER_CLEAR_CHUNK_SIZE,
      ),
  ).reduce<Promise<ChunksResult<R>>>(
    async (previous, chunk) => {
      const progress = await previous;
      if (progress.error !== null) return progress;

      try {
        const done = await runChunk(chunk);
        return { done: [...progress.done, ...done], error: null };
      } catch (error) {
        return { ...progress, error };
      }
    },
    Promise.resolve({ done: [], error: null }),
  );

export interface ClearedContainer {
  id: string;
  at: number;
  /** A moved box's place and date before the move, which its Undo puts back. */
  before?: { place: ContainerPlace; eatBy: number };
  /** A moved box's date after the move. */
  eatBy?: number;
}

interface ChangeInPlaceInput {
  uid: string;
  ids: string[];
  action: BulkAction;
}

interface ChangeInPlaceResult {
  changed: ClearedContainer[];
  skipped: SkipCounts;
  /** Set when a later chunk failed after earlier ones were written. */
  error: string | null;
}

const addCounts = (a: SkipCounts, b: SkipCounts): SkipCounts => ({
  GONE: a.GONE + b.GONE,
  FINISHED: a.FINISHED + b.FINISHED,
  MOVED: a.MOVED + b.MOVED,
  REDATED: a.REDATED + b.REDATED,
});

/** Applies one act (clear out, toss, eat, move) to every box among `ids` that is still as the screen thought, each chunk re-read inside its own transaction; resolves to the boxes it really changed and why it left the others. */
export const changeContainersInPlace = createAsyncThunk<
  ChangeInPlaceResult,
  ChangeInPlaceInput,
  { rejectValue: string }
>(
  'pinch/containers/changeInPlace',
  async ({ uid, ids, action }, { rejectWithValue }) => {
    const { done, error } = await runInChunks(
      ids,
      (
        chunk,
      ): Promise<{ changed: ClearedContainer[]; skipped: SkipCounts }[]> =>
        runTransaction(db, async (transaction) => {
          const snapshots = await Promise.all(
            chunk.map((id) => transaction.get(containerDoc(uid, id))),
          );
          const { writes, skipped } = planBulk(
            snapshots.map((snapshot) =>
              snapshot.exists() ? (snapshot.data() as Container) : null,
            ),
            action,
            Date.now(),
          );
          writes.forEach(({ id, fields }) =>
            transaction.update(containerDoc(uid, id), fields),
          );
          const changed = writes.map(({ id, fields, before }) => ({
            id,
            at: fields.updatedAt,
            ...(before === null ? {} : { before, eatBy: fields.eatBy }),
          }));
          return [{ changed, skipped }];
        }),
    );
    const changed = done.flatMap((entry) => entry.changed);
    const skipped = done.reduce(
      (counts, entry) => addCounts(counts, entry.skipped),
      NO_SKIPS,
    );
    if (changed.length > 0) void refreshFinished(uid);
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

interface UndoClearOutInput {
  uid: string;
  cleared: ClearedContainer[];
}

interface UndoClearOutResult {
  restored: number;
  error: string | null;
}

/** Puts back each changed box whose last event is still that act (an end event, or a move); one that changed since is left as it is. */
export const undoClearOut = createAsyncThunk<
  UndoClearOutResult,
  UndoClearOutInput,
  { rejectValue: string }
>(
  'pinch/containers/undoClearOut',
  async ({ uid, cleared }, { rejectWithValue }) => {
    const { done, error } = await runInChunks(cleared, (chunk) =>
      runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          chunk.map(({ id }) => transaction.get(containerDoc(uid, id))),
        );
        const now = Date.now();
        const writes = chunk.flatMap((entry, index) => {
          const snapshot = snapshots[index];
          if (!snapshot.exists()) return [];

          const container = snapshot.data() as Container;
          const plan = entry.before
            ? planUndoMove(container, entry.at, entry.before, now)
            : planUndoEnd(container, entry.at, now);
          return 'fields' in plan
            ? [{ ref: snapshot.ref, fields: plan.fields }]
            : [];
        });
        writes.forEach(({ ref, fields }) => transaction.update(ref, fields));
        return writes.map(({ ref }) => ref.id);
      }),
    );
    if (done.length > 0) void refreshFinished(uid);
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

interface EndContainersInput {
  uid: string;
  ids: string[];
  kind: 'EAT' | 'TOSS';
}

/** Ends every box of a batch (eaten whole or tossed); resolves to what its Undo needs. */
export const endContainers = createAsyncThunk<
  ClearedContainer[],
  EndContainersInput,
  { rejectValue: string }
>(
  'pinch/containers/endAll',
  async ({ uid, ids, kind }, { rejectWithValue }) => {
    try {
      const ended = await applyPlanToAll(uid, ids, (container, now) =>
        kind === 'EAT'
          ? planEat(container, 'ALL', now)
          : planToss(container, now),
      );
      void refreshFinished(uid);
      return ended;
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }
  },
);

export const changeContainersEatBy = createAsyncThunk<
  string[],
  { uid: string; ids: string[]; eatBy: number },
  { rejectValue: string }
>(
  'pinch/containers/eatByAll',
  async ({ uid, ids, eatBy }, { rejectWithValue }) => {
    try {
      await applyPlanToAll(uid, ids, (container, now) =>
        planEatBy(container, eatBy, now),
      );
    } catch (error) {
      return rejectWithValue(getWriteMessage(error, 'Unable to save this.'));
    }

    return ids;
  },
);

export const removeContainers = createAsyncThunk<
  string[],
  { uid: string; ids: string[] },
  { rejectValue: string }
>('pinch/containers/removeAll', async ({ uid, ids }, { rejectWithValue }) => {
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(containerDoc(uid, id)));
    await batch.commit();
    void refreshFinished(uid);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to delete these.'));
  }

  return ids;
});

export const removeContainer = createAsyncThunk<
  string,
  ChangeInput,
  { rejectValue: string }
>('pinch/containers/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(containerDoc(uid, id));
    void refreshFinished(uid);
  } catch (error) {
    return rejectWithValue(getWriteMessage(error, 'Unable to delete this.'));
  }

  return id;
});
