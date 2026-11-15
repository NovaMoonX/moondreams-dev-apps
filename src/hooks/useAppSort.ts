import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { APP_SORT_KEY, DEFAULT_APP_SORT, parseAppSort } from '@lib/app';

/** The app list's sort, chosen on Home and kept in this browser. */
export function useAppSort() {
  return useLocalStorageState(APP_SORT_KEY, DEFAULT_APP_SORT, parseAppSort);
}
