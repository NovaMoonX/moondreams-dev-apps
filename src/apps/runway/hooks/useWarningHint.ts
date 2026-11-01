import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

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

/** The pinned footer and the sheet's own padding, so a warning behind them counts as out of view. */
const FOOTER_ALLOWANCE_PX = 100;
const WARNING_SELECTOR = '[data-change-warning]';

const getScroller = (element: HTMLElement | null): HTMLElement | null => {
  if (!element) return null;
  const { overflowY } = getComputedStyle(element);
  return (overflowY === 'auto' || overflowY === 'scroll') &&
    element.scrollHeight > element.clientHeight
    ? element
    : getScroller(element.parentElement);
};

/** The one line a change's warning comes to, and the same line when the warning drawn in the form is not fully in view, for the footer note beside Next. */
export function useWarningHint(changeJson: string | null) {
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
  const [isOutOfView, setIsOutOfView] = useState(false);

  const text = useMemo(() => {
    if (settledJson === null || !isLedgerReady) return null;
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
  }, [settledJson, isLedgerReady, today, items, versions, openDays, isHidden]);

  useEffect(() => {
    if (text === null) return;
    let observer: IntersectionObserver | null = null;
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(WARNING_SELECTOR);
      if (!element) {
        setIsOutOfView(true);
        return;
      }
      observer = new IntersectionObserver(
        ([entry]) => setIsOutOfView(entry.intersectionRatio < 0.99),
        {
          root: getScroller(element.parentElement),
          rootMargin: `0px 0px -${FOOTER_ALLOWANCE_PX}px 0px`,
          threshold: [0, 0.99, 1],
        },
      );
      observer.observe(element);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [text]);

  return { text, hint: text !== null && isOutOfView ? text : null };
}
