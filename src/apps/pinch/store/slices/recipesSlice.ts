import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { Recipe } from '@apps/pinch/types';

export interface RecipesState {
  items: Recipe[];
  hold: HeldList<Recipe>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: RecipesState = {
  items: [],
  hold: emptyHeldList<Recipe>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const recipesSlice = createSlice({
  name: 'pinch/recipes',
  initialState,
  reducers: {
    setRecipes(state, action: PayloadAction<Recipe[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setRecipesLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearRecipes: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Recipe, RecipesState>(builder, pinchHeldActions, 'recipes', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state) => state.loadError === null,
    });
  },
});

export const { setRecipes, setRecipesLoadError, clearRecipes } =
  recipesSlice.actions;
export const recipesReducer = recipesSlice.reducer;
