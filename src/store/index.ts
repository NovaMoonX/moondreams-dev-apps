import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { type UserState, userReducer } from '@store/slices/userSlice';

export interface RootState {
  user: UserState;
}

export const store = configureStore({
  reducer: {
    user: userReducer,
  },
  devTools: true,
});

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
