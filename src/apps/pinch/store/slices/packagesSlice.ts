import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@apps/pinch/store/heldLists';
import type { Package } from '@apps/pinch/types';

export interface PackagesState {
  items: Package[];
  hold: HeldList<Package>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: PackagesState = {
  items: [],
  hold: emptyHeldList<Package>(),
  isLoaded: false,
  loadError: null,
};

const belongs = (item: Package) => item.status === 'IN_STOCK';

export const packagesSlice = createSlice({
  name: 'pinch/packages',
  initialState,
  reducers: {
    setPackages(state, action: PayloadAction<Package[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setPackagesLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearPackages: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Package, PackagesState>(
      builder,
      'packages',
      belongs,
      (state, list) => {
        state.items = list;
      },
    );
  },
});

export const { setPackages, setPackagesLoadError, clearPackages } =
  packagesSlice.actions;
export const packagesReducer = packagesSlice.reducer;
