import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { WatchlistItem } from '@apps/a-list/types';

export interface WatchlistState {
  items: WatchlistItem[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: WatchlistState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const watchlistSlice = createSlice({
  name: 'aList/watchlist',
  initialState,
  reducers: {
    setWatchlist(state, action: PayloadAction<WatchlistItem[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setWatchlistLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearWatchlist: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setWatchlist, setWatchlistLoadError, clearWatchlist } =
  watchlistSlice.actions;
export const watchlistReducer = watchlistSlice.reducer;

export default watchlistReducer;
