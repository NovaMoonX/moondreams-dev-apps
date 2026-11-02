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
import {
  describeHoldsBlocks,
  isSameLookahead,
} from '@apps/runway/utils/lookaheadText';

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

/** What a change does to how far the plan holds (shared with the effects preview so it is worked out once), the one line its warning comes to, and that line again whenever the warning drawn in the form is not fully in view, for the footer note beside Next. */
export function useWarningHint(
  changeJson: string | null,
  container: HTMLElement | null,
) {
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

  const holds = useMemo(() => {
    if (settledJson === null || !isLedgerReady) return null;
    const { before, after } = previewLookahead(
      store.getState(),
      today,
      JSON.parse(settledJson) as PreviewChange,
    );
    return {
      blocks: describeHoldsBlocks(before, after, isHidden),
      isSame: isSameLookahead(before, after),
    };
    // The plan slices are what the lookahead reads; the store snapshot is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledJson, isLedgerReady, today, items, versions, openDays, isHidden]);

  const warning = holds?.blocks.find((block) => block.tone === 'warning');
  const text = warning
    ? isHidden
      ? NEEDS_LOOK_WORDS.title
      : warning.text
    : null;

  useEffect(() => {
    if (text === null) return;
    const state: {
      observer: IntersectionObserver | null;
      watched: Element | null;
    } = { observer: null, watched: null };
    const watch = () => {
      const element = container?.querySelector(WARNING_SELECTOR) ?? null;
      if (element === state.watched) return;
      state.observer?.disconnect();
      state.observer = null;
      state.watched = element;
      if (!element) {
        setIsOutOfView(true);
        return;
      }
      state.observer = new IntersectionObserver(
        ([entry]) => setIsOutOfView(entry.intersectionRatio < 1),
        {
          root: getScroller(element.parentElement),
          rootMargin: `0px 0px -${FOOTER_ALLOWANCE_PX}px 0px`,
          threshold: [0, 1],
        },
      );
      state.observer.observe(element);
    };
    const frame = requestAnimationFrame(watch);
    const mutations = container ? new MutationObserver(watch) : null;
    if (container)
      mutations?.observe(container, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mutations?.disconnect();
      state.observer?.disconnect();
      setIsOutOfView(false);
    };
  }, [text, container]);

  return { text, holds, hint: text !== null && isOutOfView ? text : null };
}
