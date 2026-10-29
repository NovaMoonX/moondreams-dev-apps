import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { ClosingState } from '@apps/runway/engine/closings';
import type {
  DateOnly,
  OpenCard,
  OpenChange,
  OpenDay,
  OpenMove,
  OpenPurchase,
  OpenRecord,
  OpenPlan,
  OpenVersion,
  PlanItemDoc,
} from '@apps/runway/types';

export type RunwayKeyStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface RunwayState {
  keyStatus: RunwayKeyStatus;
  plan: OpenPlan | null;
  isLoaded: boolean;
  items: PlanItemDoc[];
  versions: OpenVersion[];
  isItemsLoaded: boolean;
  isVersionsLoaded: boolean;
  days: OpenDay[];
  records: OpenRecord[];
  moves: OpenMove[];
  /** Every card, archived ones too. */
  cards: OpenCard[];
  /** The cards have been read once, so a card's figures are not mistaken for none. */
  isCardsLoaded: boolean;
  /** The purchases of the recent window. */
  purchases: OpenPurchase[];
  /** Where the recent window began when the days, moves and purchases were read; they are the ledger since the closing only while it matches `selectHistory`. */
  daysFrom: DateOnly | null;
  movesFrom: DateOnly | null;
  purchasesFrom: DateOnly | null;
  /** The newest closing that applied when it was read, and the `dirtyFrom` the read was for ('none' when the plan had none). */
  closing: ClosingState | null;
  closingFor: string | null;
  /** The day this visit began, which decides how far back the history reads. */
  loadDay: DateOnly | null;
  /** The `need` key of a rebuild that did not finish, so the plan opens on what it has instead of waiting for it. */
  failedRebuild: string | null;
  /** The confirmed day ids the records were read for, as the selector joins them. */
  recordsFor: string | null;
  /** The change log's open window: what it holds, the window key it was read for, and whether the read failed. */
  changes: OpenChange[];
  changesFor: string | null;
  changesFailedFor: string | null;
  /** The purchases of the period Spend shows, and the range key they were read for. */
  periodPurchases: OpenPurchase[];
  periodFor: string | null;
  /** The range key whose read failed; Spend says so, the rest of the app is unaffected. */
  periodFailedFor: string | null;
  /** The income days and records of an older month Days shows read-only, and the window key they were read for. Kept apart from `days` and `records`, which the balances sum: an older day is already inside a closing. */
  historyDays: OpenDay[];
  historyRecords: OpenRecord[];
  historyFor: string | null;
  /** The confirmed day ids the history records were read for, as the selector joins them. */
  historyRecordsFor: string | null;
  historyFailedFor: string | null;
}

const initialState: RunwayState = {
  keyStatus: 'idle',
  plan: null,
  isLoaded: false,
  items: [],
  versions: [],
  isItemsLoaded: false,
  isVersionsLoaded: false,
  days: [],
  records: [],
  moves: [],
  cards: [],
  isCardsLoaded: false,
  purchases: [],
  daysFrom: null,
  movesFrom: null,
  purchasesFrom: null,
  closing: null,
  closingFor: null,
  loadDay: null,
  failedRebuild: null,
  recordsFor: null,
  changes: [],
  changesFor: null,
  changesFailedFor: null,
  periodPurchases: [],
  periodFor: null,
  periodFailedFor: null,
  historyDays: [],
  historyRecords: [],
  historyFor: null,
  historyRecordsFor: null,
  historyFailedFor: null,
};

export const runwaySlice = createSlice({
  name: 'runway',
  initialState,
  reducers: {
    setKeyStatus: (state, action: PayloadAction<RunwayKeyStatus>) => {
      state.keyStatus = action.payload;
    },
    clearRunway: () => initialState,
    setPlan: (state, action: PayloadAction<OpenPlan | null>) => {
      state.plan = action.payload;
      state.isLoaded = true;
    },
    setItems: (state, action: PayloadAction<PlanItemDoc[]>) => {
      state.items = action.payload;
      state.isItemsLoaded = true;
    },
    setVersions: (state, action: PayloadAction<OpenVersion[]>) => {
      state.versions = action.payload;
      state.isVersionsLoaded = true;
    },
    setDays: (
      state,
      action: PayloadAction<{ from: DateOnly; days: OpenDay[] }>,
    ) => {
      state.days = action.payload.days;
      state.daysFrom = action.payload.from;
    },
    setChanges: (
      state,
      action: PayloadAction<{ key: string; changes: OpenChange[] }>,
    ) => {
      state.changes = action.payload.changes;
      state.changesFor = action.payload.key;
      state.changesFailedFor = null;
    },
    setChangesFailed: (state, action: PayloadAction<string>) => {
      state.changesFailedFor = action.payload;
    },
    setRecords: (
      state,
      action: PayloadAction<{ dayIds: string; records: OpenRecord[] }>,
    ) => {
      state.records = action.payload.records;
      state.recordsFor = action.payload.dayIds;
    },
    setCards: (state, action: PayloadAction<OpenCard[]>) => {
      state.cards = action.payload;
      state.isCardsLoaded = true;
    },
    setMoves: (
      state,
      action: PayloadAction<{ from: DateOnly; moves: OpenMove[] }>,
    ) => {
      state.moves = action.payload.moves;
      state.movesFrom = action.payload.from;
    },
    setPurchases: (
      state,
      action: PayloadAction<{ from: DateOnly; purchases: OpenPurchase[] }>,
    ) => {
      state.purchases = action.payload.purchases;
      state.purchasesFrom = action.payload.from;
    },
    setPeriodPurchases: (
      state,
      action: PayloadAction<{ key: string; purchases: OpenPurchase[] }>,
    ) => {
      state.periodPurchases = action.payload.purchases;
      state.periodFor = action.payload.key;
      state.periodFailedFor = null;
    },
    clearPeriodPurchases: (state) => {
      state.periodPurchases = [];
      state.periodFor = null;
      state.periodFailedFor = null;
    },
    setPeriodFailed: (state, action: PayloadAction<string>) => {
      state.periodFailedFor = action.payload;
    },
    setHistoryDays: (
      state,
      action: PayloadAction<{ key: string; days: OpenDay[] }>,
    ) => {
      state.historyDays = action.payload.days;
      state.historyFor = action.payload.key;
      state.historyFailedFor = null;
    },
    setHistoryRecords: (
      state,
      action: PayloadAction<{ dayIds: string; records: OpenRecord[] }>,
    ) => {
      state.historyRecords = action.payload.records;
      state.historyRecordsFor = action.payload.dayIds;
    },
    setHistoryFailed: (state, action: PayloadAction<string>) => {
      state.historyFailedFor = action.payload;
    },
    clearHistory: (state) => {
      state.historyDays = [];
      state.historyRecords = [];
      state.historyFor = null;
      state.historyRecordsFor = null;
      state.historyFailedFor = null;
    },
    setClosing: (
      state,
      action: PayloadAction<{ closing: ClosingState | null; key: string }>,
    ) => {
      state.closing = action.payload.closing;
      state.closingFor = action.payload.key;
    },
    setLoadDay: (state, action: PayloadAction<DateOnly>) => {
      state.loadDay = action.payload;
    },
    setFailedRebuild: (state, action: PayloadAction<string | null>) => {
      state.failedRebuild = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setKeyStatus,
  clearRunway,
  setPlan,
  setItems,
  setVersions,
  setDays,
  setRecords,
  setMoves,
  setCards,
  setPurchases,
  setPeriodPurchases,
  clearPeriodPurchases,
  setPeriodFailed,
  setHistoryDays,
  setHistoryRecords,
  setHistoryFailed,
  clearHistory,
  setClosing,
  setLoadDay,
  setFailedRebuild,
  setChanges,
  setChangesFailed,
} = runwaySlice.actions;
export const runwayReducer = runwaySlice.reducer;
