import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { toTheatre } from '@apps/a-list/store/actions/theatreActions';
import type { MembershipProfile, TheatreDraft } from '@apps/a-list/types';
import { getErrorMessage } from '@/utils/errorUtils';

export interface SetupDraft {
  monthlyCostCents: number;
  /** The bill total with tax, or null when the member left it blank. */
  billTotalCents: number | null;
  taxRate: number | null;
  startDate: number;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
  /** Theaters picked in the last step; the first is the favorite unless `favoriteTheatreId` says otherwise. */
  theatres: TheatreDraft[];
  favoriteTheatreId: string | null;
}

interface CompleteSetupInput {
  uid: string;
  draft: SetupDraft;
}

export const completeSetup = createAsyncThunk<
  MembershipProfile,
  CompleteSetupInput,
  { rejectValue: string }
>(
  'aList/membership/completeSetup',
  async ({ uid, draft }, { rejectWithValue }) => {
    const now = Date.now();
    const membership: MembershipProfile = {
      uid,
      monthlyCostCents: draft.monthlyCostCents,
      monthlyTotalCents: draft.billTotalCents ?? draft.monthlyCostCents,
      taxRate: draft.billTotalCents === null ? null : draft.taxRate,
      startDate: draft.startDate,
      weeklyGoal: draft.weeklyGoal ?? null,
      monthlyGoal: draft.monthlyGoal ?? null,
      favoriteTheatreId: draft.favoriteTheatreId ?? null,
      setupCompletedAt: now,
      createdAt: now,
      lastEditedAt: now,
    };

    try {
      const membershipRef = doc(db, 'apps', 'a-list', 'memberships', uid);
      const batch = writeBatch(db);
      batch.set(membershipRef, membership);
      draft.theatres.forEach((theatre) =>
        batch.set(
          doc(membershipRef, 'theatres', theatre.theatreId),
          toTheatre(theatre, now),
        ),
      );
      await batch.commit();
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save your membership.'),
      );
    }

    return membership;
  },
);

export type MembershipEditableFields = Pick<
  MembershipProfile,
  | 'monthlyCostCents'
  | 'monthlyTotalCents'
  | 'taxRate'
  | 'startDate'
  | 'weeklyGoal'
  | 'monthlyGoal'
>;

interface UpdateMembershipInput {
  uid: string;
  fields: Partial<MembershipEditableFields>;
}

export const updateMembership = createAsyncThunk<
  Partial<MembershipEditableFields>,
  UpdateMembershipInput,
  { rejectValue: string }
>('aList/membership/update', async ({ uid, fields }, { rejectWithValue }) => {
  try {
    await updateDoc(doc(db, 'apps', 'a-list', 'memberships', uid), {
      ...fields,
      lastEditedAt: Date.now(),
    });
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to save your membership.'),
    );
  }

  return fields;
});
