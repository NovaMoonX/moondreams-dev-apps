import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { MembershipProfile } from '@apps/a-list/types';
import { getErrorMessage } from '@/utils/errorUtils';

export interface SetupDraft {
  monthlyCostCents: number;
  /** The bill total with tax, or null when the member left it blank. */
  billTotalCents: number | null;
  taxRate: number | null;
  startDate: number;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
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
      setupCompletedAt: now,
      createdAt: now,
      lastEditedAt: now,
    };

    try {
      await setDoc(doc(db, 'apps', 'a-list', 'memberships', uid), membership);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save your membership.'),
      );
    }

    return membership;
  },
);
