import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { OpenPlan } from '@apps/runway/types';

export type RunwayKeyStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface RunwayState {
  keyStatus: RunwayKeyStatus;
  plan: OpenPlan | null;
  isLoaded: boolean;
}

const initialState: RunwayState = {
  keyStatus: 'idle',
  plan: null,
  isLoaded: false,
};

export const runwaySlice = createSlice({
  name: 'runway',
  initialState,
  reducers: {
    setKeyStatus: (state, action: PayloadAction<RunwayKeyStatus>) => {
      state.keyStatus = action.payload;
    },
    setPlan: (state, action: PayloadAction<OpenPlan | null>) => {
      state.plan = action.payload;
      state.isLoaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setKeyStatus, setPlan } = runwaySlice.actions;
export const runwayReducer = runwaySlice.reducer;
