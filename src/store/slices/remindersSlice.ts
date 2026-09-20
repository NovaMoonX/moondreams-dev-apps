import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Reminder } from '@/lib/notifications/types';

export type RemindersState = OptimisticCollectionState<Reminder>;

export const remindersSlice = createOptimisticCollectionSlice<Reminder>('reminders');

export const {
  setAll: setReminders,
  upsertOneOptimistic: upsertReminder,
  removeOneOptimistic: removeReminder,
  revertOne: revertReminder,
} = remindersSlice.actions;

export const remindersReducer = remindersSlice.reducer;

export default remindersReducer;
