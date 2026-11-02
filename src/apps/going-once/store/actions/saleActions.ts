import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { ADMIN_NAME } from '@lib/app/app.constants';
import { generateUuid } from '@/utils';
import {
  MAX_BUYER_NOTE_LENGTH,
  MAX_PICKUP_AREA_LENGTH,
  MAX_SALE_NAME_LENGTH,
} from '@apps/going-once/constants';
import { upsertSale } from '@apps/going-once/store';
import type { Sale } from '@apps/going-once/types';

interface CreateSaleInput {
  uid: string;
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
}

const toTrimmedOrNull = (value: string | null) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export const createSale = createAsyncThunk<
  Sale,
  CreateSaleInput,
  { rejectValue: string }
>(
  'goingOnce/sales/create',
  async (
    { uid, name, pickupArea, buyerNote },
    { dispatch, rejectWithValue },
  ) => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      return rejectWithValue('Give your sale a name.');
    }

    const sale: Sale = {
      id: generateUuid(),
      name: trimmedName.slice(0, MAX_SALE_NAME_LENGTH),
      pickupArea:
        toTrimmedOrNull(pickupArea)?.slice(0, MAX_PICKUP_AREA_LENGTH) ?? null,
      buyerNote:
        toTrimmedOrNull(buyerNote)?.slice(0, MAX_BUYER_NOTE_LENGTH) ?? null,
      currency: 'USD',
      ownerUid: uid,
      createdBy: uid,
      members: [uid],
      createdAt: Date.now(),
      lastEditedAt: null,
    };

    try {
      await setDoc(doc(db, 'apps', 'going-once', 'sales', sale.id), sale);
    } catch (error) {
      if (
        error instanceof FirebaseError &&
        error.code === 'permission-denied'
      ) {
        return rejectWithValue(
          `We couldn't start this sale. Starting sales may be turned off for you right now: ask ${ADMIN_NAME} if you'd like it on, or refresh the page and try again.`,
        );
      }
      throw error;
    }

    dispatch(upsertSale(sale));
    return sale;
  },
);
