import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { queryClient } from '@/lib/query/queryClient';
import { getErrorMessage } from '@/utils/errorUtils';
import { containerKeys } from '@apps/pinch/queries/containerQueries';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  planCount,
  planEat,
  planEatBy,
  planMove,
  planToss,
  planUndoEnd,
  type ContainerPlan,
} from '@apps/pinch/utils/containers';

const containerDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'containers', id);

const OFFLINE_MESSAGE = 'Check your connection and try again.';
const GONE = 'This container is gone, so nothing was changed.';

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
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this container.'),
      );
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
}

const toResult = (fields: Awaited<ReturnType<typeof applyPlan>>) => ({
  at: fields.updatedAt,
  isFinished: fields.status === 'DONE',
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

export const removeContainer = createAsyncThunk<
  string,
  ChangeInput,
  { rejectValue: string }
>('pinch/containers/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(containerDoc(uid, id));
    void refreshFinished(uid);
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this container.'),
    );
  }

  return id;
});
