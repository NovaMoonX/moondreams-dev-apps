import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';

export interface OptimisticCollectionState<TDoc extends { id: string }> {
  items: TDoc[];
  previousById: Record<string, TDoc | null>;
  loaded: boolean;
}

export function createOptimisticCollectionSlice<TDoc extends { id: string }>(
  name: string,
) {
  const initialState: OptimisticCollectionState<TDoc> = {
    items: [],
    previousById: {},
    loaded: false,
  };

  return createSlice({
    name,
    initialState,
    reducers: {
      setAll(state, action: PayloadAction<TDoc[]>) {
        const sliceState = state as OptimisticCollectionState<TDoc>;

        sliceState.items = action.payload;
        sliceState.previousById = {};
        sliceState.loaded = true;
      },
      upsertOneOptimistic(state, action: PayloadAction<TDoc>) {
        const sliceState = state as OptimisticCollectionState<TDoc>;
        const payload = action.payload;
        const existing = sliceState.items.find((item) => item.id === payload.id);

        sliceState.previousById[payload.id] = existing ?? null;

        const nextItems = existing
          ? sliceState.items.map((item) =>
              item.id === payload.id ? payload : item,
            )
          : [...sliceState.items, payload];

        sliceState.items = nextItems;
      },
      removeOneOptimistic(state, action: PayloadAction<{ id: string }>) {
        const sliceState = state as OptimisticCollectionState<TDoc>;
        const existing = sliceState.items.find((item) => item.id === action.payload.id);

        sliceState.previousById[action.payload.id] = existing ?? null;
        sliceState.items = sliceState.items.filter(
          (item) => item.id !== action.payload.id,
        );
      },
      revertOne(state, action: PayloadAction<{ id: string }>) {
        const sliceState = state as OptimisticCollectionState<TDoc>;
        const previous = sliceState.previousById[action.payload.id] ?? null;

        const nextItems = previous
          ? sliceState.items.map((item) =>
              item.id === action.payload.id ? previous : item,
            )
          : sliceState.items.filter((item) => item.id !== action.payload.id);

        sliceState.items = nextItems;
        delete sliceState.previousById[action.payload.id];
      },
    },
    extraReducers: (builder) => {
      builder.addCase(resetAllState, () => initialState);
    },
  });
}
