import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';

import {
  DEFAULT_PLAN_SECTION,
  DEFAULT_RUNWAY_TAB,
  MORE_ENTRIES,
  PLAN_SECTIONS,
  RUNWAY_TABS,
} from '@apps/runway/constants';
import type { MoreEntry, PlanSection, RunwayTab } from '@apps/runway/types';

/** Runway's open tab and income day, kept in the URL so a reload and a return from another app land on the same tab. */
export function useRunwayUrlState() {
  const [requestedTab, setRequestedTab] = useQueryState(
    'tab',
    parseAsStringLiteral(RUNWAY_TABS),
  );

  const [requestedSection, setRequestedSection] = useQueryState(
    'section',
    parseAsStringLiteral(PLAN_SECTIONS),
  );

  const [requestedDay, setRequestedDay] = useQueryState('day', parseAsString);

  const [requestedMore, setRequestedMore] = useQueryState(
    'more',
    parseAsStringLiteral(MORE_ENTRIES),
  );

  const activeTab: RunwayTab = requestedTab ?? DEFAULT_RUNWAY_TAB;
  const showTab = (tab: RunwayTab) =>
    setRequestedTab(tab === DEFAULT_RUNWAY_TAB ? null : tab, {
      history: 'replace',
    });

  const planSection: PlanSection = requestedSection ?? DEFAULT_PLAN_SECTION;
  const showPlanSection = (section: PlanSection) =>
    setRequestedSection(section === DEFAULT_PLAN_SECTION ? null : section, {
      history: 'replace',
    });

  const openDay = (dayKey: string) =>
    setRequestedDay(dayKey, { history: 'replace' });
  const closeDay = () => setRequestedDay(null, { history: 'replace' });

  const openMoreEntry = (entry: MoreEntry) =>
    setRequestedMore(entry, { history: 'replace' });
  const closeMoreEntry = () => setRequestedMore(null, { history: 'replace' });

  return {
    activeTab,
    showTab,
    planSection,
    showPlanSection,
    openDayKey: requestedDay,
    openDay,
    closeDay,
    moreEntry: requestedMore,
    openMoreEntry,
    closeMoreEntry,
  };
}
