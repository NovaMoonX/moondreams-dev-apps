import { parseAsStringLiteral, useQueryState } from 'nuqs';

import { DEFAULT_RUNWAY_TAB, RUNWAY_TABS } from '@apps/runway/constants';
import type { RunwayTab } from '@apps/runway/types';

/** Runway's open tab, kept in the URL so a reload and a return from another app land on the same tab. */
export function useRunwayUrlState() {
  const [requestedTab, setRequestedTab] = useQueryState(
    'tab',
    parseAsStringLiteral(RUNWAY_TABS),
  );

  const activeTab: RunwayTab = requestedTab ?? DEFAULT_RUNWAY_TAB;
  const showTab = (tab: RunwayTab) =>
    setRequestedTab(tab === DEFAULT_RUNWAY_TAB ? null : tab, {
      history: 'replace',
    });

  return { activeTab, showTab };
}
