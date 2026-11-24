import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { EmailIntakeState } from '@/lib/emailForwarding/types';
import type { AListEmailEvent, AListEmailProgress } from '@apps/a-list/types';

export interface EmailState {
  intake: EmailIntakeState | null;
  progress: AListEmailProgress | null;
  /** Newest first. */
  events: AListEmailEvent[];
  isIntakeLoaded: boolean;
  isProgressLoaded: boolean;
  isEventsLoaded: boolean;
  loadError: string | null;
}

const initialState: EmailState = {
  intake: null,
  progress: null,
  events: [],
  isIntakeLoaded: false,
  isProgressLoaded: false,
  isEventsLoaded: false,
  loadError: null,
};

export const emailSlice = createSlice({
  name: 'aList/email',
  initialState,
  reducers: {
    setEmailIntake(state, action: PayloadAction<EmailIntakeState | null>) {
      state.intake = action.payload;
      state.isIntakeLoaded = true;
    },
    setEmailProgress(state, action: PayloadAction<AListEmailProgress | null>) {
      state.progress = action.payload;
      state.isProgressLoaded = true;
    },
    setEmailEvents(state, action: PayloadAction<AListEmailEvent[]>) {
      state.events = action.payload;
      state.isEventsLoaded = true;
    },
    setEmailLoadError(state, action: PayloadAction<string>) {
      state.loadError = action.payload;
    },
    clearEmail: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setEmailIntake,
  setEmailProgress,
  setEmailEvents,
  setEmailLoadError,
  clearEmail,
} = emailSlice.actions;
export const emailReducer = emailSlice.reducer;

export default emailReducer;
