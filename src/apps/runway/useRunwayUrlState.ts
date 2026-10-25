import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';

import {
  CHANGE_LOG_SPANS,
  DEFAULT_CHANGE_LOG_SPAN,
  DEFAULT_PLAN_SECTION,
  MAX_CHANGE_LOG_PAGE,
  DEFAULT_RUNWAY_TAB,
  MORE_ENTRIES,
  PLAN_SECTIONS,
  RUNWAY_TABS,
  RUNWAY_VIEWS,
  SETTINGS_VIEWS,
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

  const [requestedView, setRequestedView] = useQueryState(
    'view',
    parseAsStringLiteral(RUNWAY_VIEWS),
  );

  const [requestedSettingsView, setRequestedSettingsView] = useQueryState(
    'settingsView',
    parseAsStringLiteral(SETTINGS_VIEWS),
  );

  const [requestedSpan, setRequestedSpan] = useQueryState(
    'logSpan',
    parseAsStringLiteral(CHANGE_LOG_SPANS),
  );
  const [requestedPage, setRequestedPage] = useQueryState(
    'logPage',
    parseAsInteger,
  );
  const [requestedItem, setRequestedItem] = useQueryState(
    'logItem',
    parseAsString,
  );

  const [requestedSpendEnvelope, setRequestedSpendEnvelope] = useQueryState(
    'spendEnvelope',
    parseAsString,
  );

  const [requestedPurchase, setRequestedPurchase] = useQueryState(
    'purchase',
    parseAsString,
  );
  const openPurchase = (purchaseId: string) =>
    setRequestedPurchase(purchaseId, { history: 'replace' });
  const closePurchase = () =>
    setRequestedPurchase(null, { history: 'replace' });

  const [requestedCheckEnvelope, setRequestedCheckEnvelope] = useQueryState(
    'checkEnvelope',
    parseAsString,
  );
  const openCheckAmount = (envelopeId: string | null) => {
    setRequestedCheckEnvelope(envelopeId, { history: 'replace' });
    setRequestedView('checkAmount', { history: 'replace' });
  };

  const logSpan = requestedSpan ?? DEFAULT_CHANGE_LOG_SPAN;
  const logPage = Math.min(
    MAX_CHANGE_LOG_PAGE,
    Math.max(0, requestedPage ?? 0),
  );
  const setLogSpan = (span: (typeof CHANGE_LOG_SPANS)[number]) => {
    setRequestedSpan(span === DEFAULT_CHANGE_LOG_SPAN ? null : span, {
      history: 'replace',
    });
    setRequestedPage(null, { history: 'replace' });
  };
  const setLogPage = (page: number) =>
    setRequestedPage(page <= 0 ? null : page, { history: 'replace' });
  const setLogItem = (itemId: string | null) => {
    setRequestedItem(itemId, { history: 'replace' });
    setRequestedPage(null, { history: 'replace' });
  };

  const activeTab: RunwayTab = requestedTab ?? DEFAULT_RUNWAY_TAB;
  const showTab = (tab: RunwayTab) =>
    setRequestedTab(tab === DEFAULT_RUNWAY_TAB ? null : tab, {
      history: 'replace',
    });

  const showSpend = (envelopeId: string | null) => {
    setRequestedSpendEnvelope(envelopeId, { history: 'replace' });
    setRequestedTab('spend', { history: 'replace' });
  };
  const showSpendEnvelope = (envelopeId: string | null) =>
    setRequestedSpendEnvelope(envelopeId, { history: 'replace' });

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
  const openSettingsView = (settingsView: (typeof SETTINGS_VIEWS)[number]) =>
    setRequestedSettingsView(settingsView, { history: 'replace' });
  const closeSettingsView = () =>
    setRequestedSettingsView(null, { history: 'replace' });
  const closeMoreEntry = () => {
    setRequestedMore(null, { history: 'replace' });
    setRequestedSettingsView(null, { history: 'replace' });
    setRequestedSpan(null, { history: 'replace' });
    setRequestedPage(null, { history: 'replace' });
    setRequestedItem(null, { history: 'replace' });
  };

  const openView = (view: (typeof RUNWAY_VIEWS)[number]) =>
    setRequestedView(view, { history: 'replace' });
  const closeView = () => {
    setRequestedView(null, { history: 'replace' });
    setRequestedCheckEnvelope(null, { history: 'replace' });
  };

  return {
    activeTab,
    view: requestedView,
    openView,
    closeView,
    showTab,
    showSpend,
    spendEnvelope: requestedSpendEnvelope,
    purchaseId: requestedPurchase,
    checkEnvelope: requestedCheckEnvelope,
    openCheckAmount,
    openPurchase,
    closePurchase,
    showSpendEnvelope,
    planSection,
    showPlanSection,
    openDayKey: requestedDay,
    openDay,
    closeDay,
    settingsView: requestedSettingsView,
    openSettingsView,
    closeSettingsView,
    moreEntry: requestedMore,
    openMoreEntry,
    closeMoreEntry,
    logSpan,
    logPage,
    logItem: requestedItem,
    setLogSpan,
    setLogPage,
    setLogItem,
  };
}
