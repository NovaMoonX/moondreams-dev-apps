import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { type NineLivesState, nineLivesReducer } from '@apps/nine-lives/store';
import { type WaypointState, waypointReducer } from '@apps/waypoint/store';
import { type RemindersState, remindersReducer } from '@store/slices/remindersSlice';
import { type UserState, userReducer } from '@store/slices/userSlice';

export interface RootState {
  user: UserState;
  reminders: RemindersState;
  nineLives: NineLivesState;
  waypoint: WaypointState;
}

export const store = configureStore({
  reducer: {
    user: userReducer,
    reminders: remindersReducer,
    nineLives: nineLivesReducer,
    waypoint: waypointReducer,
  },
  devTools: true,
});

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
