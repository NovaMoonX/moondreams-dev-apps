import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type {
  OpenDay,
  OpenRecord,
  OpenPlan,
  OpenVersion,
  PlanItemDoc,
} from '@apps/runway/types';

export type RunwayKeyStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface RunwayState {
  keyStatus: RunwayKeyStatus;
  plan: OpenPlan | null;
  isLoaded: boolean;
  items: PlanItemDoc[];
  versions: OpenVersion[];
  isItemsLoaded: boolean;
  isVersionsLoaded: boolean;
  days: OpenDay[];
  isDaysLoaded: boolean;
  records: OpenRecord[];
  /** The confirmed day ids the records were read for, as the selector joins them. */
  recordsFor: string | null;
}

const initialState: RunwayState = {
  keyStatus: 'idle',
  plan: null,
  isLoaded: false,
  items: [],
  versions: [],
  isItemsLoaded: false,
  isVersionsLoaded: false,
  days: [],
  isDaysLoaded: false,
  records: [],
  recordsFor: null,
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
    setDays: (state, action: PayloadAction<OpenDay[]>) => {
      state.days = action.payload;
      state.isDaysLoaded = true;
    },
    setRecords: (
      state,
      action: PayloadAction<{ dayIds: string; records: OpenRecord[] }>,
    ) => {
      state.records = action.payload.records;
      state.recordsFor = action.payload.dayIds;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setKeyStatus,
  setPlan,
  setItems,
  setVersions,
  setDays,
  setRecords,
} = runwaySlice.actions;
export const runwayReducer = runwaySlice.reducer;
