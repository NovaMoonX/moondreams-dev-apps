import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { Expense } from '@apps/nine-lives/types';

export type ExpensesState = OptimisticCollectionState<Expense>;

export const expensesSlice = createOptimisticCollectionSlice<Expense>('nineLives/expenses');

export const {
  setAll: setExpenses,
  upsertOneOptimistic: upsertExpense,
  removeOneOptimistic: removeExpense,
  revertOne: revertExpense,
} = expensesSlice.actions;

export const expensesReducer = expensesSlice.reducer;

export default expensesReducer;
