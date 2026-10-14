import { combineReducers } from '@reduxjs/toolkit';

import { familiesReducer, type FamiliesState } from './slices/familiesSlice';
import {
  ingredientsReducer,
  type IngredientsState,
} from './slices/ingredientsSlice';
import { mealsReducer, type MealsState } from './slices/mealsSlice';
import {
  plannedMealsReducer,
  type PlannedMealsState,
} from './slices/plannedMealsSlice';
import { productsReducer, type ProductsState } from './slices/productsSlice';
import { recipesReducer, type RecipesState } from './slices/recipesSlice';
import { settingsReducer, type SettingsState } from './slices/settingsSlice';
import { sourcesReducer, type SourcesState } from './slices/sourcesSlice';
import { storesReducer, type StoresState } from './slices/storesSlice';

export interface PinchState {
  settings: SettingsState;
  plannedMeals: PlannedMealsState;
  meals: MealsState;
  ingredients: IngredientsState;
  families: FamiliesState;
  stores: StoresState;
  products: ProductsState;
  recipes: RecipesState;
  sources: SourcesState;
}

export const pinchReducer = combineReducers({
  settings: settingsReducer,
  plannedMeals: plannedMealsReducer,
  meals: mealsReducer,
  ingredients: ingredientsReducer,
  families: familiesReducer,
  stores: storesReducer,
  products: productsReducer,
  recipes: recipesReducer,
  sources: sourcesReducer,
});
