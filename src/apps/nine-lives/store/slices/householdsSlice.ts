import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Household } from '@apps/nine-lives/types';

export interface HouseholdsState {
  items: Household[];
  loaded: boolean;
}

const initialState: HouseholdsState = {
  items: [],
  loaded: false,
};

export const householdsSlice = createSlice({
  name: 'nineLives/households',
  initialState,
  reducers: {
    setHouseholds(state, action: PayloadAction<Household[]>) {
      state.items = action.payload;
      state.loaded = true;
    },
    upsertHousehold(state, action: PayloadAction<Household>) {
      const existingIndex = state.items.findIndex(
        (household) => household.id === action.payload.id,
      );

      if (existingIndex >= 0) {
        state.items[existingIndex] = action.payload;
        return;
      }

      state.items.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setHouseholds, upsertHousehold } = householdsSlice.actions;
export const householdsReducer = householdsSlice.reducer;

export default householdsReducer;
