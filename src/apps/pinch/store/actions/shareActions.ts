import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { MAX_PINCH_SHARES } from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectMealsById,
  selectRecipesById,
  selectShareBySource,
} from '@apps/pinch/store/selectors';
import type {
  ChangePinchShareRequest,
  ChangePinchShareResult,
  ShareKind,
} from '@apps/pinch/types';
import { buildSharePayload, getShareSource } from '@apps/pinch/utils/sharing';

const changePinchShareCallable = httpsCallable<
  ChangePinchShareRequest,
  ChangePinchShareResult
>(functions, 'changePinchShare');

type ShareAction = 'create' | 'update' | 'renew' | 'delete';

type ShareChange = { shareId: string | null } | { error: string };

const OFFLINE_MESSAGE = 'Sharing needs a connection.';

const TRY_AGAIN: Record<ShareAction, string> = {
  create: "We couldn't make the link just now. Try again in a moment.",
  update: "We couldn't update the shared copy just now. Try again in a moment.",
  renew: "We couldn't make a new link just now. Try again in a moment.",
  delete: "We couldn't stop sharing just now. Try again in a moment.",
};

const getCallableCode = (error: unknown) => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null;
  const result =
    typeof code === 'string' ? code.replace(/^functions\//, '') : null;

  return result;
};

const getShareFailure = (error: unknown, action: ShareAction) => {
  const code = getCallableCode(error);
  if (!navigator.onLine || code === 'unavailable') return OFFLINE_MESSAGE;
  if (code === 'resource-exhausted') {
    return `You have ${MAX_PINCH_SHARES} shared links, the most you can have at once. Stop one under Settings, Shared links.`;
  }
  if (code === 'not-found') return 'That link is already gone.';
  return TRY_AGAIN[action];
};

const sendShareChange = async (
  request: ChangePinchShareRequest,
  action: ShareAction,
): Promise<ShareChange> => {
  if (!navigator.onLine) return { error: OFFLINE_MESSAGE };

  try {
    const result = await changePinchShareCallable(request);
    return { shareId: result.data.shareId };
  } catch (error) {
    console.error('Pinch could not change a shared link', action, error);
    if (action === 'delete' && getCallableCode(error) === 'not-found') {
      return { shareId: null };
    }
    return { error: getShareFailure(error, action) };
  }
};

const SETTLE_POLLS = 40;
const SETTLE_POLL_MS = 100;

/** The record reaches the store a moment after the callable answers; waiting keeps the screen from showing the old link in between. Gives up quietly, since the change is already made. */
const waitForListener = async (isArrived: () => boolean): Promise<void> => {
  const poll = async (left: number): Promise<void> => {
    if (left === 0 || isArrived()) return;
    await new Promise((resolve) => window.setTimeout(resolve, SETTLE_POLL_MS));
    return poll(left - 1);
  };

  return poll(SETTLE_POLLS);
};

interface SaveShareInput {
  kind: ShareKind;
  sourceId: string;
}

export const saveShare = createAsyncThunk<
  string,
  SaveShareInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/shares/save',
  async ({ kind, sourceId }, { getState, rejectWithValue }) => {
    const state = getState();
    const recipesById = selectRecipesById(state);
    const source = getShareSource(
      kind,
      sourceId,
      recipesById,
      selectMealsById(state),
    );
    if (source === null) {
      return rejectWithValue('This is gone, so there is nothing to share.');
    }

    const payload = buildSharePayload(
      source,
      recipesById,
      selectIngredientsById(state),
    );
    if ('error' in payload) return rejectWithValue(payload.error);

    const existing = selectShareBySource(kind, sourceId)(state);
    const action = existing === null ? 'create' : 'update';
    const result = await sendShareChange(
      { action, shareId: existing?.id ?? null, kind, sourceId, ...payload },
      action,
    );
    if ('error' in result) return rejectWithValue(result.error);
    if (result.shareId === null) return rejectWithValue(TRY_AGAIN[action]);

    await waitForListener(() => {
      const arrived = selectShareBySource(kind, sourceId)(getState());
      return arrived !== null && arrived.updatedAt !== existing?.updatedAt;
    });

    return result.shareId;
  },
);

export const renewShareLink = createAsyncThunk<
  string,
  string,
  { state: RootState; rejectValue: string }
>('pinch/shares/renew', async (shareId, { getState, rejectWithValue }) => {
  const result = await sendShareChange({ action: 'renew', shareId }, 'renew');
  if ('error' in result) return rejectWithValue(result.error);
  const renewedId = result.shareId;
  if (renewedId === null) return rejectWithValue(TRY_AGAIN.renew);

  await waitForListener(() =>
    getState().pinch.shares.items.some((share) => share.id === renewedId),
  );

  return renewedId;
});

/** A link that is already gone counts as stopped. */
export const stopSharing = createAsyncThunk<
  void,
  string,
  { state: RootState; rejectValue: string }
>('pinch/shares/stop', async (shareId, { getState, rejectWithValue }) => {
  const result = await sendShareChange({ action: 'delete', shareId }, 'delete');
  if ('error' in result) return rejectWithValue(result.error);

  await waitForListener(
    () => !getState().pinch.shares.items.some((share) => share.id === shareId),
  );
});

/** For a delete that has already committed: never awaited, and a failure only leaves the link listed under Shared links as "The original was deleted". */
export function stopSharingDeleted(
  state: RootState,
  kind: ShareKind,
  sourceId: string,
) {
  const share = selectShareBySource(kind, sourceId)(state);
  if (share === null) return;

  void sendShareChange({ action: 'delete', shareId: share.id }, 'delete').then(
    (result) => {
      if ('error' in result) {
        console.error(
          'Pinch could not stop the link of a deleted original',
          result.error,
        );
      }
    },
  );
}
