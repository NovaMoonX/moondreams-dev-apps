import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { OpenPlan, OpenVersion, PlanItemDoc } from '@apps/runway/types';

export type RunwayKeyStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface RunwayState {
  keyStatus: RunwayKeyStatus;
  plan: OpenPlan | null;
  isLoaded: boolean;
  items: PlanItemDoc[];
  versions: OpenVersion[];
  isItemsLoaded: boolean;
  isVersionsLoaded: boolean;
}

const initialState: RunwayState = {
  keyStatus: 'idle',
  plan: null,
  isLoaded: false,
  items: [],
  versions: [],
  isItemsLoaded: false,
  isVersionsLoaded: false,
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
    setItems: (state, action: PayloadAction<PlanItemDoc[]>) => {
      state.items = action.payload;
      state.isItemsLoaded = true;
    },
    setVersions: (state, action: PayloadAction<OpenVersion[]>) => {
      state.versions = action.payload;
      state.isVersionsLoaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setKeyStatus, setPlan, setItems, setVersions } =
  runwaySlice.actions;
export const runwayReducer = runwaySlice.reducer;
