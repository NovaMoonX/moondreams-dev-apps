import { useDeferredValue, useMemo } from 'react';
import { useStore } from 'react-redux';

import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector, type RootState } from '@/store';
import { NEEDS_LOOK_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  previewLookahead,
  type PreviewChange,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeHoldsBlocks } from '@apps/runway/utils/lookaheadText';

/** One line for a form's footer saying what the change leaves short, so a short screen whose warning sits below the fold still shows it; null elsewhere and while nothing is short. */
export function useWarningHint(changeJson: string | null) {
  const isShort = useIsShortScreen(599);
  const { isHidden } = useValuesHidden();
  const store = useStore<RootState>();
  const today = todayAsUtcDate();
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const openDays = useAppSelector((state) => state.runway.days);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const settledJson = useDeferredValue(changeJson);

  const result = useMemo(() => {
    if (!isShort || settledJson === null || !isLedgerReady) return null;
    const { before, after } = previewLookahead(
      store.getState(),
      today,
      JSON.parse(settledJson) as PreviewChange,
    );
    const warning = describeHoldsBlocks(before, after, isHidden).find(
      (block) => block.tone === 'warning',
    );
    if (!warning) return null;
    return isHidden ? NEEDS_LOOK_WORDS.title : warning.text;
    // The plan slices are what the lookahead reads; the store snapshot is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isShort,
    settledJson,
    isLedgerReady,
    today,
    items,
    versions,
    openDays,
    isHidden,
  ]);
  return result;
}
