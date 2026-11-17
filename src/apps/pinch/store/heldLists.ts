import { createAction, type ActionReducerMapBuilder } from '@reduxjs/toolkit';

import {
  addHeldWrites,
  dropHeldWrites,
  layHeldLists,
  settleHeldWrites,
  type HeldWrite,
} from '@/utils/heldWrites';

/** Each kitchen collection a transaction's write can be held over, by its listener list. */
export const PINCH_HELD_KINDS = [
  'shoppingItems',
  'cooks',
  'ingredients',
  'plannedMeals',
  'recipes',
  'notes',
  'containers',
  'packages',
  'stores',
  'products',
  'collections',
] as const;

export type PinchHeldKind = (typeof PINCH_HELD_KINDS)[number];

export interface PinchHoldInput {
  token: string;
  writes: Partial<Record<PinchHeldKind, HeldWrite<unknown>[]>>;
}

export const holdPinchWrites = createAction<PinchHoldInput>('pinch/held/hold');
export const settlePinchWrites = createAction<string>('pinch/held/settle');
export const dropPinchWrites = createAction<string>('pinch/held/drop');

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
  loadError: string | null;
}

/** The hold, settle and drop cases for one list; a retried transaction's holds replace its earlier attempt's, and a list whose listener failed keeps no hold. */
export function addHeldCases<T extends Identified, S extends HeldSliceState<T>>(
  builder: ActionReducerMapBuilder<S>,
  kind: PinchHeldKind,
  belongs: (item: T, state: S) => boolean,
  show: (state: S, list: T[]) => void,
): void {
  const relay = (state: S) => {
    const list = lay(state.hold, (item) => belongs(item, state), Date.now());
    if (list !== null) show(state, list);
  };
  builder
    .addCase(holdPinchWrites, (draft, action) => {
      const state = draft as unknown as S;
      const { token, writes } = action.payload;
      const added = (writes[kind] ?? []) as HeldWrite<T>[];
      const hasOwn = state.hold.held.some((hold) => hold.token === token);
      if (added.length === 0 && !hasOwn) return;
      if (state.loadError !== null) return;
      state.hold.held = addHeldWrites(
        dropHeldWrites(state.hold.held, token),
        added,
      );
      relay(state);
    })
    .addCase(settlePinchWrites, (draft, action) => {
      const state = draft as unknown as S;
      if (!state.hold.held.some((hold) => hold.token === action.payload)) {
        return;
      }
      state.hold.held = settleHeldWrites(state.hold.held, action.payload);
    })
    .addCase(dropPinchWrites, (draft, action) => {
      const state = draft as unknown as S;
      if (!state.hold.held.some((hold) => hold.token === action.payload)) {
        return;
      }
      state.hold.held = dropHeldWrites(state.hold.held, action.payload);
      relay(state);
    });
}
