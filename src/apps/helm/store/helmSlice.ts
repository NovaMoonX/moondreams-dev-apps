import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { HelmProfile, OpenCapture } from '@apps/helm/types';

export interface CaptureSet {
  captures: OpenCapture[];
  /** Whether the first snapshot has arrived, so an empty set is never mistaken for one still loading. */
  isLoaded: boolean;
  /** Set when the listener failed; the last value stays. */
  isFailed: boolean;
}

/** Whether the data key is here: `offline` when it couldn't be asked for, `failed` when the server refused it. */
export type KeyStatus = 'loading' | 'ready' | 'offline' | 'failed';

export interface HelmState {
  keyStatus: KeyStatus;
  /** Raised by Try again; asking for the key again follows it. */
  keyAttempt: number;
  isKeyRetrying: boolean;
  /** The profile, and whether the first snapshot has arrived, so a missing profile is never mistaken for one still loading. */
  profile: HelmProfile | null;
  isProfileLoaded: boolean;
  /** The uid the profile belongs to, so a person's profile never shows for another. */
  uid: string | null;
  /** Turns from yesterday on (the home surface's eager window). */
  recentCaptures: CaptureSet;
  /** Turns not yet seen in the Inbox, whenever they were said. */
  unseenCaptures: CaptureSet;
  /** Older sessions, brought in a page at a time as the person scrolls up. */
  earlier: {
    captures: OpenCapture[];
    isLoading: boolean;
    isFailed: boolean;
    isExhausted: boolean;
  };
}

const emptySet: CaptureSet = { captures: [], isLoaded: false, isFailed: false };

const initialState: HelmState = {
  keyStatus: 'loading',
  keyAttempt: 0,
  isKeyRetrying: false,
  profile: null,
  isProfileLoaded: false,
  uid: null,
  recentCaptures: emptySet,
  unseenCaptures: emptySet,
  earlier: {
    captures: [],
    isLoading: false,
    isFailed: false,
    isExhausted: false,
  },
};

const helmSlice = createSlice({
  name: 'helm',
  initialState,
  reducers: {
    setKeyStatus: (state, action: PayloadAction<KeyStatus>) => {
      state.keyStatus = action.payload;
      state.isKeyRetrying = false;
    },
    retryKey: (state) => {
      state.keyAttempt += 1;
      state.isKeyRetrying = true;
    },
    setProfile: (
      state,
      action: PayloadAction<{ uid: string; profile: HelmProfile | null }>,
    ) => {
      state.uid = action.payload.uid;
      state.profile = action.payload.profile;
      state.isProfileLoaded = true;
    },
    setRecentCaptures: (state, action: PayloadAction<OpenCapture[]>) => {
      state.recentCaptures = {
        captures: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setRecentCapturesFailed: (state) => {
      state.recentCaptures.isFailed = true;
    },
    setUnseenCaptures: (state, action: PayloadAction<OpenCapture[]>) => {
      state.unseenCaptures = {
        captures: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setUnseenCapturesFailed: (state) => {
      state.unseenCaptures.isFailed = true;
    },
    startLoadingEarlier: (state) => {
      state.earlier.isLoading = true;
      state.earlier.isFailed = false;
    },
    addEarlierCaptures: (
      state,
      action: PayloadAction<{ captures: OpenCapture[]; isExhausted: boolean }>,
    ) => {
      state.earlier = {
        captures: [...state.earlier.captures, ...action.payload.captures],
        isLoading: false,
        isFailed: false,
        isExhausted: action.payload.isExhausted,
      };
    },
    setEarlierFailed: (state) => {
      state.earlier.isLoading = false;
      state.earlier.isFailed = true;
    },
    clearHelm: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setProfile,
  setRecentCaptures,
  setRecentCapturesFailed,
  setUnseenCaptures,
  setUnseenCapturesFailed,
  startLoadingEarlier,
  addEarlierCaptures,
  setEarlierFailed,
  clearHelm,
  setKeyStatus,
  retryKey,
} = helmSlice.actions;
export const helmReducer = helmSlice.reducer;
