import { combineReducers } from '@reduxjs/toolkit';

import { familiesReducer, type FamiliesState } from './slices/familiesSlice';
import {
  ingredientsReducer,
  type IngredientsState,
} from './slices/ingredientsSlice';
import { productsReducer, type ProductsState } from './slices/productsSlice';
import { recipesReducer, type RecipesState } from './slices/recipesSlice';
import { storesReducer, type StoresState } from './slices/storesSlice';

export interface PinchState {
  ingredients: IngredientsState;
  families: FamiliesState;
  stores: StoresState;
  products: ProductsState;
  recipes: RecipesState;
}

export const pinchReducer = combineReducers({
  ingredients: ingredientsReducer,
  families: familiesReducer,
  stores: storesReducer,
  products: productsReducer,
  recipes: recipesReducer,
});
