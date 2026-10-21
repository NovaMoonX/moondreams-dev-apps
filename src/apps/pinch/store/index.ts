import { combineReducers } from '@reduxjs/toolkit';

import { familiesReducer, type FamiliesState } from './slices/familiesSlice';
import {
  ingredientsReducer,
  type IngredientsState,
} from './slices/ingredientsSlice';
import { storesReducer, type StoresState } from './slices/storesSlice';

export interface PinchState {
  ingredients: IngredientsState;
  families: FamiliesState;
  stores: StoresState;
}

export const pinchReducer = combineReducers({
  ingredients: ingredientsReducer,
  families: familiesReducer,
  stores: storesReducer,
});
