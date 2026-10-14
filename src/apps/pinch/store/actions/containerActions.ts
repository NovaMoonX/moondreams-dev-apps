import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, runTransaction, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { queryClient } from '@/lib/query/queryClient';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { containerKeys } from '@apps/pinch/queries/containerQueries';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  buildContainer,
  getNewContainerProblem,
  planEat,
  planEatBy,
  planMove,
  planToss,
  planUndoEnd,
  type ContainerPlan,
  type NewContainerInput,
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

const getAddProblem = (
  state: RootState,
  input: Omit<NewContainerInput, 'id'>,
) => {
  const { isLoaded, loadError, items } = state.pinch.containers;
  if (loadError !== null) {
    return "Your prepared meals couldn't load, so adding is paused.";
  }
  if (!isLoaded) {
    return 'Your prepared meals are still loading. Try again in a moment.';
  }
  return getNewContainerProblem(input, items.length);
};

interface AddContainerInput {
  uid: string;
  container: Omit<NewContainerInput, 'id'>;
}

export const addContainer = createAsyncThunk<
  Container,
  AddContainerInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/containers/add',
  async ({ uid, container }, { getState, rejectWithValue }) => {
    const problem = getAddProblem(getState(), container);
    if (problem !== null) return rejectWithValue(problem);

    const created = buildContainer(
      { ...container, id: generateUuid() },
      Date.now(),
    );

    try {
      await setDoc(containerDoc(uid, created.id), created);
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this container.'),
      );
    }

    return created;
  },
);

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
