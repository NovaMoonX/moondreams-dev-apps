import {
  createAction,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldWrites,
  applyHeldWrites,
  dropHeldWrites,
  patchHeldWrite,
  settleHeldWrites,
  type HeldWrite,
} from '@/utils/heldWrites';
import {
  layPurchaseLists,
  type PurchaseList,
} from '@apps/runway/utils/purchaseHolds';
import { withBankBalances } from '@apps/runway/engine/accounts';
import type {
  OpenEmailEvent,
  OpenEmailFilter,
  OpenEmailIntake,
  OpenEmailSetup,
} from '@apps/runway/store/listeners/emailListeners';
import type { ClosingState } from '@apps/runway/engine/closings';
import type { OpenFiguresSnapshot } from '@apps/runway/utils/figuresSnapshot';
import type {
  DateOnly,
  OpenAccount,
  OpenAccountBalance,
  OpenCardStatement,
  OpenLink,
  OpenCard,
  OpenExpense,
  OpenDoneForYou,
  OpenMemory,
  OpenStartedPayment,
  OpenRule,
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
  /** The server's stored figures, a head start for Home until the ledger is read; null when there are none. */
  figuresSnapshot: OpenFiguresSnapshot | null;
  /** Epoch ms of the latest write this device had made when the plan opened; null when none is known. */
  lastWriteAt: number | null;
  /** True once the ledger has been read this open, so the head start never stands in for a later reload. */
  isHeadStartOver: boolean;
  items: PlanItemDoc[];
  versions: OpenVersion[];
  isItemsLoaded: boolean;
  isVersionsLoaded: boolean;
  /** The comparable merchant names each bill that pays itself has learned, by bill id, opened from its header. */
  matchKeys: Record<string, string[]>;
  /** The learned names have been opened once, so a bill that has some is never read as having none. */
  isMatchKeysLoaded: boolean;
  days: OpenDay[];
  records: OpenRecord[];
  moves: OpenMove[];
  /** Every card, archived ones too. */
  cards: OpenCard[];
  /** The cards have been read once, so a card's figures are not mistaken for none. */
  isCardsLoaded: boolean;
  /** Every account, archived ones too. */
  accounts: OpenAccount[];
  /** The accounts as stored, before a linked account takes the bank's figure. */
  savedAccounts: OpenAccount[];
  /** The accounts have been read once, so an account's figures are not mistaken for none. */
  isAccountsLoaded: boolean;
  /** Every link a bank sign-in made, and what the bank last said each linked account or card holds. */
  links: OpenLink[];
  isLinksLoaded: boolean;
  accountBalances: OpenAccountBalance[];
  /** The bank balances have been read once, so a linked account is not drawn as holding nothing. */
  isAccountBalancesLoaded: boolean;
  /** What the bank's latest statement says about each linked card. */
  cardStatements: OpenCardStatement[];
  /** Every expense group. */
  expenses: OpenExpense[];
  /** Every always-do-this rule, and whether they have been read once, so no pass runs on a rule list that is still arriving. */
  rules: OpenRule[];
  isRulesLoaded: boolean;
  /** The moves and payers the person confirmed by hand, and whether they have been read once, so no pass runs before they arrive. */
  memories: OpenMemory[];
  startedPayments: OpenStartedPayment[];
  isMemoriesLoaded: boolean;
  /** What the app did on its own in the last 30 days, newest first, and whether it has been read once. */
  doneForYou: OpenDoneForYou[];
  isDoneForYouLoaded: boolean;
  /** The forwarding address, the latest emails that reached it and the person's filters; read only while the email switch is open. */
  emailIntake: OpenEmailIntake | null;
  emailSetup: OpenEmailSetup | null;
  emailEvents: OpenEmailEvent[];
  isEmailEventsLoaded: boolean;
  emailFilters: OpenEmailFilter[];
  /** The purchases of the recent window. */
  purchases: OpenPurchase[];
  /** Every purchase waiting for a home, whatever its date, and whether they have been read once. */
  needsHome: OpenPurchase[];
  isNeedsHomeLoaded: boolean;
  /** Where the recent window began when the days, moves and purchases were read; they are the ledger since the closing only while it matches `selectHistory`. */
  daysFrom: DateOnly | null;
  movesFrom: DateOnly | null;
  purchasesFrom: DateOnly | null;
  /** The purchases dated around the days banks were linked, which may be older than the recent window; null until read. */
  linkHistoryPurchases: OpenPurchase[] | null;
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
  incoming: HeldLists;
  incomingNeedsHome: OpenPurchase[];
  incomingPeriod: OpenPurchase[];
  deliveredAtNeedsHome: number | null;
  deliveredAtPeriod: number | null;
  purchaseLanded: Record<string, PurchaseList[]>;
  held: { [K in HeldKind]: HeldWrite<HeldLists[K][number]>[] };
  deliveredAt: { [K in HeldKind]: number | null };
}

interface HeldLists {
  days: OpenDay[];
  records: OpenRecord[];
  moves: OpenMove[];
  purchases: OpenPurchase[];
}

export type HeldKind = keyof HeldLists;

export interface HeldWritesInput {
  token: string;
  days?: HeldWrite<OpenDay>[];
  records?: HeldWrite<OpenRecord>[];
  moves?: HeldWrite<OpenMove>[];
  purchases?: HeldWrite<OpenPurchase>[];
}

const HELD_KINDS: HeldKind[] = ['days', 'records', 'moves', 'purchases'];

const layPurchases = (state: RunwayState) => {
  const laid = layPurchaseLists({
    window: state.incoming.purchases,
    needsHome: state.incomingNeedsHome,
    period: state.incomingPeriod,
    deliveredAt: {
      window: state.deliveredAt.purchases,
      needsHome: state.deliveredAtNeedsHome,
      period: state.deliveredAtPeriod,
    },
    purchasesFrom: state.purchasesFrom,
    periodFor:
      state.periodFailedFor === state.periodFor ? null : state.periodFor,
    held: state.held.purchases,
    landed: state.purchaseLanded,
  });
  state.purchases = laid.purchases;
  state.needsHome = laid.needsHome;
  state.periodPurchases = laid.periodPurchases;
  state.held.purchases = laid.held;
  state.purchaseLanded = laid.landed;
};

const layHeld = (state: RunwayState, kind: HeldKind) => {
  if (kind === 'purchases') {
    layPurchases(state);
    return;
  }
  const { list, held } = applyHeldWrites<HeldLists[typeof kind][number]>(
    state.incoming[kind],
    state.held[kind],
    (item) => item.id,
    { deliveredAt: state.deliveredAt[kind] },
  );
  (state[kind] as HeldLists[typeof kind]) = list as HeldLists[typeof kind];
  (state.held[kind] as HeldWrite<HeldLists[typeof kind][number]>[]) = held;
};

const initialState: RunwayState = {
  keyStatus: 'idle',
  plan: null,
  isLoaded: false,
  figuresSnapshot: null,
  lastWriteAt: null,
  isHeadStartOver: false,
  items: [],
  versions: [],
  isItemsLoaded: false,
  isVersionsLoaded: false,
  matchKeys: {},
  isMatchKeysLoaded: false,
  days: [],
  records: [],
  moves: [],
  cards: [],
  isCardsLoaded: false,
  accounts: [],
  savedAccounts: [],
  isAccountsLoaded: false,
  links: [],
  isLinksLoaded: false,
  accountBalances: [],
  isAccountBalancesLoaded: false,
  cardStatements: [],
  expenses: [],
  rules: [],
  isRulesLoaded: false,
  memories: [],
  startedPayments: [],
  isMemoriesLoaded: false,
  doneForYou: [],
  isDoneForYouLoaded: false,
  emailIntake: null,
  emailSetup: null,
  emailEvents: [],
  isEmailEventsLoaded: false,
  emailFilters: [],
  purchases: [],
  needsHome: [],
  isNeedsHomeLoaded: false,
  daysFrom: null,
  movesFrom: null,
  purchasesFrom: null,
  linkHistoryPurchases: null,
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
  incoming: { days: [], records: [], moves: [], purchases: [] },
  incomingNeedsHome: [],
  incomingPeriod: [],
  deliveredAtNeedsHome: null,
  deliveredAtPeriod: null,
  purchaseLanded: {},
  deliveredAt: { days: null, records: null, moves: null, purchases: null },
  held: { days: [], records: [], moves: [], purchases: [] },
};

export const holdWrites = createAction<HeldWritesInput>('runway/holdWrites');
export const settleWrites = createAction<string>('runway/settleWrites');
export const dropWrites = createAction<string>('runway/dropWrites');
// A plain write to a held record shows through the hold, which would otherwise hide Firestore's own local copy.
export const patchHeld = createAction<{
  kind: HeldKind;
  id: string;
  fields: Record<string, unknown>;
}>('runway/patchHeld');

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
    setFiguresSnapshot: (
      state,
      action: PayloadAction<OpenFiguresSnapshot | null>,
    ) => {
      if (state.isHeadStartOver) return;
      state.figuresSnapshot = action.payload;
    },
    startHeadStart: (state, action: PayloadAction<number | null>) => {
      state.figuresSnapshot = null;
      state.isHeadStartOver = false;
      state.lastWriteAt = action.payload;
    },
    endHeadStart: (state) => {
      state.figuresSnapshot = null;
      state.isHeadStartOver = true;
    },
    setItems: (state, action: PayloadAction<PlanItemDoc[]>) => {
      state.items = action.payload;
      state.isItemsLoaded = true;
    },
    setMatchKeys: (state, action: PayloadAction<Record<string, string[]>>) => {
      state.matchKeys = action.payload;
      state.isMatchKeysLoaded = true;
    },
    setVersions: (state, action: PayloadAction<OpenVersion[]>) => {
      state.versions = action.payload;
      state.isVersionsLoaded = true;
    },
    setDays: (
      state,
      action: PayloadAction<{ from: DateOnly; days: OpenDay[] }>,
    ) => {
      state.incoming.days = action.payload.days;
      state.deliveredAt.days = Date.now();
      layHeld(state, 'days');
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
      state.incoming.records = action.payload.records;
      state.deliveredAt.records = Date.now();
      layHeld(state, 'records');
      state.recordsFor = action.payload.dayIds;
    },
    setExpenses: (state, action: PayloadAction<OpenExpense[]>) => {
      state.expenses = action.payload;
    },
    setRules: (state, action: PayloadAction<OpenRule[]>) => {
      state.rules = action.payload;
      state.isRulesLoaded = true;
    },
    setMemories: (state, action: PayloadAction<OpenMemory[]>) => {
      state.memories = action.payload;
      state.isMemoriesLoaded = true;
    },
    setDoneForYou: (state, action: PayloadAction<OpenDoneForYou[]>) => {
      state.doneForYou = action.payload;
      state.isDoneForYouLoaded = true;
    },
    setEmailIntake: (state, action: PayloadAction<OpenEmailIntake | null>) => {
      state.emailIntake = action.payload;
    },
    setEmailSetup: (state, action: PayloadAction<OpenEmailSetup | null>) => {
      state.emailSetup = action.payload;
    },
    setEmailEvents: (state, action: PayloadAction<OpenEmailEvent[] | null>) => {
      state.emailEvents = action.payload ?? [];
      state.isEmailEventsLoaded = action.payload !== null;
    },
    setEmailFilters: (state, action: PayloadAction<OpenEmailFilter[]>) => {
      state.emailFilters = action.payload;
    },
    setCards: (state, action: PayloadAction<OpenCard[]>) => {
      state.cards = action.payload;
      state.isCardsLoaded = true;
    },
    setAccounts: (state, action: PayloadAction<OpenAccount[]>) => {
      state.savedAccounts = action.payload;
      state.accounts = withBankBalances(action.payload, state.accountBalances);
      state.isAccountsLoaded = true;
    },
    setLinks: (state, action: PayloadAction<OpenLink[]>) => {
      state.links = action.payload;
      state.isLinksLoaded = true;
    },
    setAccountBalances: (
      state,
      action: PayloadAction<OpenAccountBalance[]>,
    ) => {
      state.accountBalances = action.payload;
      state.accounts = withBankBalances(state.savedAccounts, action.payload);
      state.isAccountBalancesLoaded = true;
    },
    setCardStatements: (state, action: PayloadAction<OpenCardStatement[]>) => {
      state.cardStatements = action.payload;
    },
    setStartedPayments: (
      state,
      action: PayloadAction<OpenStartedPayment[]>,
    ) => {
      state.startedPayments = action.payload;
    },
    setMoves: (
      state,
      action: PayloadAction<{ from: DateOnly; moves: OpenMove[] }>,
    ) => {
      state.incoming.moves = action.payload.moves;
      state.deliveredAt.moves = Date.now();
      layHeld(state, 'moves');
      state.movesFrom = action.payload.from;
    },
    setPurchases: (
      state,
      action: PayloadAction<{ from: DateOnly; purchases: OpenPurchase[] }>,
    ) => {
      state.incoming.purchases = action.payload.purchases;
      state.deliveredAt.purchases = Date.now();
      state.purchasesFrom = action.payload.from;
      layPurchases(state);
    },
    setLinkHistoryPurchases: (
      state,
      action: PayloadAction<OpenPurchase[] | null>,
    ) => {
      state.linkHistoryPurchases = action.payload;
    },
    setNeedsHome: (state, action: PayloadAction<OpenPurchase[]>) => {
      state.incomingNeedsHome = action.payload;
      state.deliveredAtNeedsHome = Date.now();
      state.isNeedsHomeLoaded = true;
      layPurchases(state);
    },
    setPeriodPurchases: (
      state,
      action: PayloadAction<{ key: string; purchases: OpenPurchase[] }>,
    ) => {
      state.incomingPeriod = action.payload.purchases;
      state.deliveredAtPeriod = Date.now();
      state.periodFor = action.payload.key;
      state.periodFailedFor = null;
      layPurchases(state);
    },
    clearPeriodPurchases: (state) => {
      state.incomingPeriod = [];
      state.deliveredAtPeriod = null;
      state.periodFor = null;
      state.periodFailedFor = null;
      layPurchases(state);
    },
    setPeriodFailed: (state, action: PayloadAction<string>) => {
      state.periodFailedFor = action.payload;
      layPurchases(state);
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
    builder.addCase(holdWrites, (state, action) => {
      HELD_KINDS.forEach((kind) => {
        const added = action.payload[kind] ?? [];
        const before = state.held[kind] as HeldWrite<unknown>[];
        if (added.length === 0 && before.length === 0) return;
        (state.held[kind] as HeldWrite<unknown>[]) = addHeldWrites<unknown>(
          dropHeldWrites<unknown>(before, action.payload.token),
          added,
        );
        layHeld(state, kind);
      });
    });
    builder.addCase(settleWrites, (state, action) => {
      HELD_KINDS.forEach((kind) => {
        if (state.held[kind].length === 0) return;
        (state.held[kind] as HeldWrite<unknown>[]) = settleHeldWrites<unknown>(
          state.held[kind],
          action.payload,
        );
        layHeld(state, kind);
      });
    });
    builder.addCase(dropWrites, (state, action) => {
      HELD_KINDS.forEach((kind) => {
        if (state.held[kind].length === 0) return;
        (state.held[kind] as HeldWrite<unknown>[]) = dropHeldWrites<unknown>(
          state.held[kind],
          action.payload,
        );
        layHeld(state, kind);
      });
    });
    builder.addCase(patchHeld, (state, action) => {
      const { kind, id, fields } = action.payload;
      if (!state.held[kind].some((hold) => hold.id === id)) return;
      (state.held[kind] as HeldWrite<unknown>[]) = patchHeldWrite<unknown>(
        state.held[kind],
        id,
        fields,
      );
      layHeld(state, kind);
    });
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setKeyStatus,
  clearRunway,
  endHeadStart,
  startHeadStart,
  setPlan,
  setFiguresSnapshot,
  setItems,
  setMatchKeys,
  setVersions,
  setDays,
  setRecords,
  setMoves,
  setCards,
  setAccounts,
  setLinks,
  setAccountBalances,
  setCardStatements,
  setStartedPayments,
  setExpenses,
  setRules,
  setMemories,
  setDoneForYou,
  setEmailIntake,
  setEmailEvents,
  setEmailFilters,
  setEmailSetup,
  setPurchases,
  setLinkHistoryPurchases,
  setPeriodPurchases,
  setNeedsHome,
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
