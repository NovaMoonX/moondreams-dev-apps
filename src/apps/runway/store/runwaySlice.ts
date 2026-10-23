import { createSlice } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';

export interface RunwayState {
  isLoaded: boolean;
}

const initialState: RunwayState = { isLoaded: false };

export const runwaySlice = createSlice({
  name: 'runway',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const runwayReducer = runwaySlice.reducer;
