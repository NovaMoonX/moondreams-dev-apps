import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { type AListState, aListReducer } from '@apps/a-list/store';
import { type NineLivesState, nineLivesReducer } from '@apps/nine-lives/store';
import { type PinchState, pinchReducer } from '@apps/pinch/store';
import {
  runwayReducer,
  type RunwayState,
} from '@apps/runway/store/runwaySlice';
import { type WaypointState, waypointReducer } from '@apps/waypoint/store';
import { type FeedbackState, feedbackReducer } from '@store/slices/feedbackSlice';
import { type RemindersState, remindersReducer } from '@store/slices/remindersSlice';
import { type UserState, userReducer } from '@store/slices/userSlice';

export interface RootState {
  user: UserState;
  reminders: RemindersState;
  feedback: FeedbackState;
  nineLives: NineLivesState;
  waypoint: WaypointState;
  aList: AListState;
  pinch: PinchState;
  runway: RunwayState;
}

export const store = configureStore({
  reducer: {
    user: userReducer,
    reminders: remindersReducer,
    feedback: feedbackReducer,
    nineLives: nineLivesReducer,
    waypoint: waypointReducer,
    aList: aListReducer,
    pinch: pinchReducer,
    runway: runwayReducer,
  },
  devTools: true,
});

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
