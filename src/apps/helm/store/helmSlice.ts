import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type {
  HelmProfile,
  OpenCapture,
  OpenExecution,
  OpenTask,
} from '@apps/helm/types';

export interface CaptureSet {
  captures: OpenCapture[];
  /** Whether the first snapshot has arrived, so an empty set is never mistaken for one still loading. */
  isLoaded: boolean;
  /** Set when the listener failed; the last value stays. */
  isFailed: boolean;
}

export interface LoadedSet<T> {
  items: T[];
  isLoaded: boolean;
  isFailed: boolean;
}

/** Whether the data key is here: `offline` when it couldn't be asked for, `failed` when the server refused it. */
export type KeyStatus = 'loading' | 'ready' | 'offline' | 'failed';

export interface HelmState {
  keyStatus: KeyStatus;
  /** Raised by Try again; asking for the key again follows it. */
  keyAttempt: number;
  isKeyRetrying: boolean;
  /** Refusals in a row, so a Try again that fails again can say so. */
  keyRefusals: number;
  /** The profile, and whether the first snapshot has arrived, so a missing profile is never mistaken for one still loading. */
  profile: HelmProfile | null;
  isProfileLoaded: boolean;
  /** The uid the profile belongs to, so a person's profile never shows for another. */
  uid: string | null;
  /** Turns from yesterday on (the home surface's eager window). */
  recentCaptures: CaptureSet;
  /** Turns not yet seen in the Inbox, whenever they were said. */
  unseenCaptures: CaptureSet;
  /** Turns waiting to be read, being read, failed or asking the person, whenever they were said. */
  waitingCaptures: CaptureSet;
  /** The person's open tasks, newest first. */
  openTasks: LoadedSet<OpenTask>;
  /** What the assistant did for the turns in the eager window. */
  recentExecutions: LoadedSet<OpenExecution>;
  /** What it did for the earlier sessions scrolled into view. */
  earlierExecutions: OpenExecution[];
  /** Executions fetched by id that couldn't be opened, so their turns can say so. */
  failedExecutionIds: string[];
  /** Older sessions, brought in a page at a time as the person scrolls up. */
  earlier: {
    captures: OpenCapture[];
    isLoading: boolean;
    isFailed: boolean;
    isExhausted: boolean;
  };
}

const emptySet: CaptureSet = { captures: [], isLoaded: false, isFailed: false };

const emptyLoadedSet = { items: [], isLoaded: false, isFailed: false };

const initialState: HelmState = {
  keyStatus: 'loading',
  keyAttempt: 0,
  isKeyRetrying: false,
  keyRefusals: 0,
  profile: null,
  isProfileLoaded: false,
  uid: null,
  recentCaptures: emptySet,
  unseenCaptures: emptySet,
  waitingCaptures: emptySet,
  openTasks: emptyLoadedSet,
  recentExecutions: emptyLoadedSet,
  earlierExecutions: [],
  failedExecutionIds: [],
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
      state.keyRefusals =
        action.payload === 'failed' ? state.keyRefusals + 1 : 0;
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
    setWaitingCaptures: (state, action: PayloadAction<OpenCapture[]>) => {
      state.waitingCaptures = {
        captures: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setWaitingCapturesFailed: (state) => {
      state.waitingCaptures.isFailed = true;
    },
    setOpenTasks: (state, action: PayloadAction<OpenTask[]>) => {
      state.openTasks = {
        items: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setOpenTasksFailed: (state) => {
      state.openTasks.isFailed = true;
    },
    setRecentExecutions: (state, action: PayloadAction<OpenExecution[]>) => {
      state.recentExecutions = {
        items: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setRecentExecutionsFailed: (state) => {
      state.recentExecutions.isFailed = true;
    },
    addEarlierExecutions: (state, action: PayloadAction<OpenExecution[]>) => {
      const known = new Set(state.earlierExecutions.map((entry) => entry.id));
      state.earlierExecutions = [
        ...state.earlierExecutions,
        ...action.payload.filter((entry) => !known.has(entry.id)),
      ];
    },
    markExecutionUndone: (
      state,
      action: PayloadAction<{ executionId: string; undoExecutionId: string }>,
    ) => {
      state.earlierExecutions = state.earlierExecutions.map((entry) =>
        entry.id === action.payload.executionId
          ? { ...entry, undoneByExecutionId: action.payload.undoExecutionId }
          : entry,
      );
    },
    addFailedExecutions: (state, action: PayloadAction<string[]>) => {
      state.failedExecutionIds = [
        ...new Set([...state.failedExecutionIds, ...action.payload]),
      ];
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
  setWaitingCaptures,
  setWaitingCapturesFailed,
  setOpenTasks,
  setOpenTasksFailed,
  setRecentExecutions,
  setRecentExecutionsFailed,
  addEarlierExecutions,
  markExecutionUndone,
  addFailedExecutions,
  startLoadingEarlier,
  addEarlierCaptures,
  setEarlierFailed,
  clearHelm,
  setKeyStatus,
  retryKey,
} = helmSlice.actions;
export const helmReducer = helmSlice.reducer;
