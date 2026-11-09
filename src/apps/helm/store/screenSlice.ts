import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { ScreenContext } from '@apps/helm/types';

export type InputMode = 'voice' | 'typed';

/** The words the ask control, its chip and its way back use; held in memory only and never sent. */
export interface ScreenLabels {
  ask: string;
  chip: string;
  back: string;
}

/** Where the page's ask control is drawn: at the page's foot, or at the foot of the sheet open over it. */
export type ScreenPlacement = 'page' | 'sheet';

export interface ScreenEntry {
  ownerId: string;
  context: ScreenContext;
  labels: ScreenLabels;
  placement: ScreenPlacement;
}

export interface ScreenState {
  /** Oldest first: the latest entry is what is in front, so a sheet's sits over its page's. */
  entries: ScreenEntry[];
  /** How the conversation over the page was asked for. */
  askMode: InputMode;
}

const initialState: ScreenState = { entries: [], askMode: 'typed' };

const screenSlice = createSlice({
  name: 'helmScreen',
  initialState,
  reducers: {
    publishScreen: (state, action: PayloadAction<ScreenEntry>) => {
      const at = state.entries.findIndex(
        (entry) => entry.ownerId === action.payload.ownerId,
      );
      if (at === -1) state.entries.push(action.payload);
      else state.entries[at] = action.payload;
    },
    clearScreen: (state, action: PayloadAction<string>) => {
      state.entries = state.entries.filter(
        (entry) => entry.ownerId !== action.payload,
      );
    },
    setAskMode: (state, action: PayloadAction<InputMode>) => {
      state.askMode = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { publishScreen, clearScreen, setAskMode } = screenSlice.actions;
export const screenReducer = screenSlice.reducer;

export const selectTopScreen = (state: { helmScreen: ScreenState }) =>
  state.helmScreen.entries.at(-1) ?? null;
