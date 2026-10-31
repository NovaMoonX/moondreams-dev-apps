import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Feedback } from '@/lib/feedback/types';
import { resetAllState } from '@/store/actions/globalActions';

type LoadStatus = 'loading' | 'ready' | 'error';

export interface FeedbackState {
  mine: Feedback[];
  mineStatus: LoadStatus;
  adminUnreadCount: number | null;
  adminUnreadStatus: LoadStatus | 'off';
}

const initialState: FeedbackState = {
  mine: [],
  mineStatus: 'loading',
  adminUnreadCount: null,
  adminUnreadStatus: 'off',
};

const feedbackSlice = createSlice({
  name: 'feedback',
  initialState,
  reducers: {
    setMyFeedback: (state, action: PayloadAction<Feedback[]>) => {
      state.mine = action.payload;
      state.mineStatus = 'ready';
    },
    setMyFeedbackStatus: (state, action: PayloadAction<LoadStatus>) => {
      state.mineStatus = action.payload;
    },
    setAdminUnread: (state, action: PayloadAction<number>) => {
      state.adminUnreadCount = action.payload;
      state.adminUnreadStatus = 'ready';
    },
    setAdminUnreadStatus: (
      state,
      action: PayloadAction<FeedbackState['adminUnreadStatus']>,
    ) => {
      state.adminUnreadStatus = action.payload;
      state.adminUnreadCount = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setMyFeedback,
  setMyFeedbackStatus,
  setAdminUnread,
  setAdminUnreadStatus,
} = feedbackSlice.actions;

export const feedbackReducer = feedbackSlice.reducer;

type StateWithFeedback = { feedback: FeedbackState };

export const selectMyFeedback = (state: StateWithFeedback) =>
  state.feedback.mine;

export const selectMyFeedbackStatus = (state: StateWithFeedback) =>
  state.feedback.mineStatus;

export const selectMyUnreadCount = (state: StateWithFeedback) =>
  state.feedback.mine.filter((item) => item.isUnreadBySender).length;

export const selectAdminUnreadCount = (state: StateWithFeedback) =>
  state.feedback.adminUnreadCount;

/** The inbox badge: replies waiting for me plus, for the admin, feedback waiting for them. Null until both are known, so it never shows 0 early. */
export const selectInboxBadgeCount = (
  state: StateWithFeedback,
): number | null => {
  const { mineStatus, adminUnreadStatus, adminUnreadCount } = state.feedback;
  if (mineStatus === 'loading' || adminUnreadStatus === 'loading') return null;
  return (
    selectMyUnreadCount(state) +
    (adminUnreadStatus === 'ready' ? (adminUnreadCount ?? 0) : 0)
  );
};

export default feedbackReducer;
