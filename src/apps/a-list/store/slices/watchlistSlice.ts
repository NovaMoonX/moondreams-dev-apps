import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { aListHeldActions, type WithId } from '@apps/a-list/store/heldLists';
import type { WatchlistItem } from '@apps/a-list/types';

export interface WatchlistState {
  items: WithId<WatchlistItem>[];
  hold: HeldList<WithId<WatchlistItem>>;
  uid: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const belongs = () => true;

const initialState: WatchlistState = {
  items: [],
  hold: emptyHeldList<WithId<WatchlistItem>>(),
  uid: null,
  isLoaded: false,
  loadError: null,
};

export const watchlistSlice = createSlice({
  name: 'aList/watchlist',
  initialState,
  reducers: {
    setWatchlist(
      state,
      action: PayloadAction<{ uid: string; items: WithId<WatchlistItem>[] }>,
    ) {
      if (action.payload.uid !== state.uid) state.hold = emptyHeldList();
      state.uid = action.payload.uid;
      state.items = deliverHeld(state.hold, action.payload.items, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setWatchlistLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearWatchlist: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<WithId<WatchlistItem>, WatchlistState>(
      builder,
      aListHeldActions,
      'watchlist',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state, scope) =>
          state.isLoaded && state.loadError === null && state.uid === scope,
      },
    );
  },
});

export const { setWatchlist, setWatchlistLoadError, clearWatchlist } =
  watchlistSlice.actions;
export const watchlistReducer = watchlistSlice.reducer;

export default watchlistReducer;
