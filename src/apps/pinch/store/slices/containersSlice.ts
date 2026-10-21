import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Container } from '@apps/pinch/types';

export interface ContainersState {
  items: Container[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ContainersState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const containersSlice = createSlice({
  name: 'pinch/containers',
  initialState,
  reducers: {
    setContainers(state, action: PayloadAction<Container[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setContainersLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearContainers: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setContainers, setContainersLoadError, clearContainers } =
  containersSlice.actions;
export const containersReducer = containersSlice.reducer;
