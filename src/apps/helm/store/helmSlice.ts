import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { ACTIVITY_PAGE } from '@apps/helm/constants';
import { resetAllState } from '@/store/actions/globalActions';
import type {
  HelmProfile,
  OpenCapture,
  OpenExecution,
  OpenFact,
  OpenMedia,
  OpenPlace,
  OpenTask,
  OpenWho,
  PlanDay,
  SyncedRecord,
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

export interface PlanDaySet {
  /** Keyed by day ("YYYY-MM-DD" in the profile's zone). */
  byId: Record<string, PlanDay>;
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
  /** The plan days from yesterday to six days ahead. */
  planDays: PlanDaySet;
  /** The person's confirmed and inferred facts, and the superseded ones they replaced. */
  facts: LoadedSet<OpenFact>;
  /** The people, pets and organizations the person knows. */
  who: LoadedSet<OpenWho>;
  /** The places the person has named. */
  places: LoadedSet<OpenPlace>;
  /** The photos kept for people and places, with their nonces opened; the bytes stay in Storage. */
  media: LoadedSet<OpenMedia>;
  /** Copies of other apps' records, opened. */
  synced: LoadedSet<SyncedRecord>;
  /** What the assistant did for the turns in the eager window. */
  recentExecutions: LoadedSet<OpenExecution>;
  /** What it did for the earlier sessions scrolled into view. */
  earlierExecutions: OpenExecution[];
  /** Every execution, newest first, while Activity is open. */
  activity: LoadedSet<OpenExecution> & { limit: number; isExhausted: boolean };
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

const emptyPlanDays: PlanDaySet = {
  byId: {},
  isLoaded: false,
  isFailed: false,
};

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
  planDays: emptyPlanDays,
  facts: emptyLoadedSet,
  who: emptyLoadedSet,
  places: emptyLoadedSet,
  media: emptyLoadedSet,
  synced: emptyLoadedSet,
  recentExecutions: emptyLoadedSet,
  earlierExecutions: [],
  activity: {
    ...emptyLoadedSet,
    limit: ACTIVITY_PAGE,
    isExhausted: false,
  },
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
    setPlanDays: (state, action: PayloadAction<PlanDay[]>) => {
      state.planDays = {
        byId: Object.fromEntries(
          action.payload.map((entry) => [entry.id, entry]),
        ),
        isLoaded: true,
        isFailed: false,
      };
    },
    setPlanDaysFailed: (state) => {
      state.planDays.isFailed = true;
    },
    setFacts: (state, action: PayloadAction<OpenFact[]>) => {
      state.facts = { items: action.payload, isLoaded: true, isFailed: false };
    },
    setFactsFailed: (state) => {
      state.facts.isFailed = true;
    },
    setWho: (state, action: PayloadAction<OpenWho[]>) => {
      state.who = { items: action.payload, isLoaded: true, isFailed: false };
    },
    setWhoFailed: (state) => {
      state.who.isFailed = true;
    },
    setPlaces: (state, action: PayloadAction<OpenPlace[]>) => {
      state.places = {
        items: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setPlacesFailed: (state) => {
      state.places.isFailed = true;
    },
    setMedia: (state, action: PayloadAction<OpenMedia[]>) => {
      state.media = { items: action.payload, isLoaded: true, isFailed: false };
    },
    setMediaFailed: (state) => {
      state.media.isFailed = true;
    },
    setSynced: (state, action: PayloadAction<SyncedRecord[]>) => {
      state.synced = {
        items: action.payload,
        isLoaded: true,
        isFailed: false,
      };
    },
    setSyncedFailed: (state) => {
      state.synced.isFailed = true;
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
      const patch = (entry: OpenExecution) =>
        entry.id === action.payload.executionId
          ? { ...entry, undoneByExecutionId: action.payload.undoExecutionId }
          : entry;
      state.earlierExecutions = state.earlierExecutions.map(patch);
      state.recentExecutions.items = state.recentExecutions.items.map(patch);
      state.activity.items = state.activity.items.map(patch);
    },
    setActivity: (state, action: PayloadAction<OpenExecution[]>) => {
      state.activity = {
        items: action.payload,
        isLoaded: true,
        isFailed: false,
        limit: state.activity.limit,
        isExhausted: action.payload.length < state.activity.limit,
      };
    },
    setActivityFailed: (state) => {
      state.activity.isFailed = true;
    },
    showMoreActivity: (state, action: PayloadAction<number>) => {
      if (state.activity.limit === action.payload) {
        state.activity.limit += ACTIVITY_PAGE;
      }
    },
    clearActivity: (state) => {
      state.activity = initialState.activity;
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
  setPlanDays,
  setPlanDaysFailed,
  setFacts,
  setFactsFailed,
  setWho,
  setWhoFailed,
  setPlaces,
  setPlacesFailed,
  setMedia,
  setMediaFailed,
  setSynced,
  setSyncedFailed,
  setRecentExecutions,
  setRecentExecutionsFailed,
  addEarlierExecutions,
  markExecutionUndone,
  setActivity,
  setActivityFailed,
  showMoreActivity,
  clearActivity,
  addFailedExecutions,
  startLoadingEarlier,
  addEarlierCaptures,
  setEarlierFailed,
  clearHelm,
  setKeyStatus,
  retryKey,
} = helmSlice.actions;
export const helmReducer = helmSlice.reducer;
