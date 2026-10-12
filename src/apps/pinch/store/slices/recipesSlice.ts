import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Recipe } from '@apps/pinch/types';

export interface RecipesState {
  items: Recipe[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: RecipesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const recipesSlice = createSlice({
  name: 'pinch/recipes',
  initialState,
  reducers: {
    setRecipes(state, action: PayloadAction<Recipe[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setRecipesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearRecipes: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setRecipes, setRecipesLoadError, clearRecipes } =
  recipesSlice.actions;
export const recipesReducer = recipesSlice.reducer;
