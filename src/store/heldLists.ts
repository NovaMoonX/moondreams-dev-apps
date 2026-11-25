import {
  createAction,
  type ActionCreatorWithPayload,
  type ActionReducerMapBuilder,
} from '@reduxjs/toolkit';

import {
  addHeldWrites,
  dropHeldWrites,
  layHeldLists,
  settleHeldWrites,
  type HeldWrite,
} from '@/utils/heldWrites';

export interface HoldInput {
  token: string;
  /** Which part of the app's data the writes belong to; a list for another scope ignores them. */
  scope: string | null;
  writes: Partial<Record<string, HeldWrite<unknown>[]>>;
}

export interface HeldActions {
  hold: ActionCreatorWithPayload<HoldInput>;
  settle: ActionCreatorWithPayload<string>;
  drop: ActionCreatorWithPayload<string>;
}

/** The hold, settle and drop actions of one app's held lists, named under its prefix. */
export const createHeldActions = (prefix: string): HeldActions => ({
  hold: createAction<HoldInput>(`${prefix}/held/hold`),
  settle: createAction<string>(`${prefix}/held/settle`),
  drop: createAction<string>(`${prefix}/held/drop`),
});

/** A listener's own copy of its list and the device's writes waiting to show in it. */
export interface HeldList<T> {
  incoming: T[];
  /** Null until the listener has delivered once. */
  deliveredAt: number | null;
  held: HeldWrite<T>[];
}

export const emptyHeldList = <T>(): HeldList<T> => ({
  incoming: [],
  deliveredAt: null,
  held: [],
});

interface Identified {
  id: string;
}

/** The listener's list with the holds laid over it, or null while it is still loading; lays nothing a list never delivered. */
const lay = <T extends Identified>(
  hold: HeldList<T>,
  belongs: (item: T) => boolean,
  now: number,
): T[] | null => {
  if (hold.deliveredAt === null) return null;
  if (hold.held.length === 0) return hold.incoming;
  const laid = layHeldLists<T, 'list'>({
    lists: {
      list: { incoming: hold.incoming, deliveredAt: hold.deliveredAt, belongs },
    },
    held: hold.held,
    landed: {},
    idOf: (item) => item.id,
    now,
  });
  hold.held = laid.held;
  return laid.lists.list;
};

/** Keeps a delivery as the listener's own copy and returns what the screen shows: it with the holds laid over. */
export const deliverHeld = <T extends Identified>(
  hold: HeldList<T>,
  items: T[],
  belongs: (item: T) => boolean,
  now: number = Date.now(),
): T[] => {
  hold.incoming = items;
  hold.deliveredAt = now;
  return lay(hold, belongs, now) ?? items;
};

interface HeldSliceState<T> {
  hold: HeldList<T>;
}

/** One listener list of a slice that can hold a transaction's writes. */
export interface HeldListCases<S> {
  kind: string;
  holdOf: (state: S) => HeldList<Identified>;
  belongs: (item: Identified, state: S) => boolean;
  show: (state: S, list: Identified[]) => void;
  accepts: (state: S, scope: string | null) => boolean;
}

/** The hold, settle and drop cases for one list; a retried transaction's holds replace its earlier attempt's, and a list `accepts` decides is not open takes none. */
export function addHeldCases<T extends Identified, S extends HeldSliceState<T>>(
  builder: ActionReducerMapBuilder<S>,
  actions: HeldActions,
  kind: string,
  {
    belongs,
    show,
    accepts,
  }: {
    belongs: (item: T, state: S) => boolean;
    show: (state: S, list: T[]) => void;
    accepts: (state: S, scope: string | null) => boolean;
  },
): void {
  addHeldListsCases(builder, actions, [
    {
      kind,
      holdOf: (state) => state.hold as HeldList<Identified>,
      belongs: (item, state) => belongs(item as T, state),
      show: (state, list) => show(state, list as T[]),
      accepts,
    },
  ]);
}

/** `addHeldCases` for a slice that keeps several held lists, registered once since a slice takes one reducer per action. */
export function addHeldListsCases<S>(
  builder: ActionReducerMapBuilder<S>,
  actions: HeldActions,
  lists: HeldListCases<S>[],
): void {
  const relay = (state: S, list: HeldListCases<S>) => {
    const laid = lay(
      list.holdOf(state),
      (item) => list.belongs(item, state),
      Date.now(),
    );
    if (laid !== null) list.show(state, laid);
  };
  builder
    .addCase(actions.hold, (draft, action) => {
      const state = draft as unknown as S;
      const { token, scope, writes } = action.payload;
      lists.forEach((list) => {
        const hold = list.holdOf(state);
        const added = (writes[list.kind] ?? []) as HeldWrite<Identified>[];
        const hasOwn = hold.held.some((held) => held.token === token);
        if (added.length === 0 && !hasOwn) return;
        if (!list.accepts(state, scope)) return;
        hold.held = addHeldWrites(dropHeldWrites(hold.held, token), added);
        relay(state, list);
      });
    })
    .addCase(actions.settle, (draft, action) => {
      const state = draft as unknown as S;
      lists.forEach((list) => {
        const hold = list.holdOf(state);
        if (!hold.held.some((held) => held.token === action.payload)) return;
        hold.held = settleHeldWrites(hold.held, action.payload);
        relay(state, list);
      });
    })
    .addCase(actions.drop, (draft, action) => {
      const state = draft as unknown as S;
      lists.forEach((list) => {
        const hold = list.holdOf(state);
        if (!hold.held.some((held) => held.token === action.payload)) return;
        hold.held = dropHeldWrites(hold.held, action.payload);
        relay(state, list);
      });
    });
}
