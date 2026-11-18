import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { Container } from '@apps/pinch/types';

export interface ContainersState {
  items: Container[];
  hold: HeldList<Container>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ContainersState = {
  items: [],
  hold: emptyHeldList<Container>(),
  isLoaded: false,
  loadError: null,
};

const belongs = (item: Container) => item.status === 'IN_STOCK';

export const containersSlice = createSlice({
  name: 'pinch/containers',
  initialState,
  reducers: {
    setContainers(state, action: PayloadAction<Container[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setContainersLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearContainers: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Container, ContainersState>(
      builder,
      pinchHeldActions,
      'containers',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state) => state.loadError === null,
      },
    );
  },
});

export const { setContainers, setContainersLoadError, clearContainers } =
  containersSlice.actions;
export const containersReducer = containersSlice.reducer;
