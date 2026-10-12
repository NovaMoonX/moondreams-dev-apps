import { combineReducers } from '@reduxjs/toolkit';

import { familiesReducer, type FamiliesState } from './slices/familiesSlice';
import {
  ingredientsReducer,
  type IngredientsState,
} from './slices/ingredientsSlice';

export interface PinchState {
  ingredients: IngredientsState;
  families: FamiliesState;
}

export const pinchReducer = combineReducers({
  ingredients: ingredientsReducer,
  families: familiesReducer,
});
