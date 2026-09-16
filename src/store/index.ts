import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { type NineLivesState, nineLivesReducer } from '@apps/nine-lives/store';
import { type WaypointState, waypointReducer } from '@apps/waypoint/store';
import { type UserState, userReducer } from '@store/slices/userSlice';

export interface RootState {
  user: UserState;
  nineLives: NineLivesState;
  waypoint: WaypointState;
}

export const store = configureStore({
  reducer: {
    user: userReducer,
    nineLives: nineLivesReducer,
    waypoint: waypointReducer,
  },
  devTools: true,
});

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
