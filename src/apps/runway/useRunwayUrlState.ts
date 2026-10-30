import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { useNavigate } from 'react-router-dom';

import {
  CHANGE_LOG_SPANS,
  DEFAULT_CHANGE_LOG_SPAN,
  DEFAULT_PLAN_SECTION,
  DEFAULT_SPEND_PERIOD,
  SPEND_PERIODS,
  MAX_CHANGE_LOG_PAGE,
  DEFAULT_RUNWAY_TAB,
  MORE_ENTRIES,
  PLAN_SECTIONS,
  RUNWAY_TABS,
  RUNWAY_VIEWS,
  START_METHODS,
  SETTINGS_VIEWS,
} from '@apps/runway/constants';
import { isMonthKey } from '@apps/runway/engine/closings';
import type { MoreEntry, PlanSection, RunwayTab } from '@apps/runway/types';

/** Runway's open tab and income day, kept in the URL so a reload and a return from another app land on the same tab. */
export function useRunwayUrlState() {
  const navigate = useNavigate();
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

  const [requestedMethod, setRequestedMethod] = useQueryState(
    'method',
    parseAsStringLiteral(START_METHODS),
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
  const [requestedCheckFrom, setRequestedCheckFrom] = useQueryState(
    'checkFrom',
    parseAsBoolean,
  );
  const openCheckAmount = (
    envelopeId: string | null,
    isFromFreeToSpend = false,
  ) => {
    setRequestedCheckEnvelope(envelopeId, { history: 'replace' });
    setRequestedCheckFrom(isFromFreeToSpend ? true : null, {
      history: 'replace',
    });
    setRequestedView('checkAmount', { history: 'replace' });
  };

  const closeCheckAmount = () => {
    setRequestedCheckEnvelope(null, { history: 'replace' });
    setRequestedCheckFrom(null, { history: 'replace' });
    setRequestedView('freeToSpend', { history: 'replace' });
  };

  const openCheckBalance = () =>
    setRequestedView('checkBalance', { history: 'replace' });
  const closeCheckBalance = () =>
    setRequestedView('freeToSpend', { history: 'replace' });

  const [requestedFixes, setRequestedFixes] = useQueryState(
    'fixes',
    parseAsBoolean,
  );
  const openFixes = () => setRequestedFixes(true, { history: 'replace' });
  const closeFixes = () => setRequestedFixes(null, { history: 'replace' });

  const [requestedDueBill, setRequestedDueBill] = useQueryState(
    'dueBill',
    parseAsString,
  );
  const openDueBill = (billId: string) =>
    setRequestedDueBill(billId, { history: 'replace' });
  const closeDueBill = () => setRequestedDueBill(null, { history: 'replace' });

  const [requestedGroups, setRequestedGroups] = useQueryState(
    'groups',
    parseAsBoolean,
  );
  const openGroups = () => setRequestedGroups(true, { history: 'replace' });
  const closeGroups = () => setRequestedGroups(null, { history: 'replace' });

  const [requestedPeriod, setRequestedPeriod] = useQueryState(
    'period',
    parseAsString,
  );
  const spendPeriod =
    requestedPeriod !== null &&
    (isMonthKey(requestedPeriod) ||
      (SPEND_PERIODS as readonly string[]).includes(requestedPeriod))
      ? requestedPeriod
      : DEFAULT_SPEND_PERIOD;
  const showSpendPeriod = (period: string) =>
    setRequestedPeriod(period === DEFAULT_SPEND_PERIOD ? null : period, {
      history: 'replace',
    });

  const [requestedDaysMonth, setRequestedDaysMonth] = useQueryState(
    'daysMonth',
    parseAsString,
  );
  const daysMonth = isMonthKey(requestedDaysMonth) ? requestedDaysMonth : null;
  const showDaysMonth = (month: string | null) =>
    setRequestedDaysMonth(month, { history: 'replace' });

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
  // nuqs writes the URL without telling the router, so the entry Home leaves by carries its own marker
  // and Back from any other tab pops to it; only leaving Home adds an entry.
  const markTabStep = () => {
    const { backLayerKey, backLayerSeq, ...entry } = window.history.state ?? {};
    void backLayerKey;
    void backLayerSeq;
    window.history.replaceState({ ...entry, runwayTabStep: true }, '');
  };
  const showTab = (tab: RunwayTab) => {
    if (tab === activeTab) return;
    if (requestedFixes !== null) closeFixes();
    if (requestedDueBill !== null) closeDueBill();
    if (tab === DEFAULT_RUNWAY_TAB) {
      if (window.history.state?.runwayTabStep) {
        navigate(-1);
        return;
      }
      setRequestedTab(null, { history: 'replace' });
      return;
    }
    if (activeTab === DEFAULT_RUNWAY_TAB) {
      void setRequestedTab(tab, { history: 'push' }).then(markTabStep);
      return;
    }
    setRequestedTab(tab, { history: 'replace' });
  };

  const showSpend = (envelopeId: string | null) => {
    setRequestedSpendEnvelope(envelopeId, { history: 'replace' });
    showTab('spend');
  };
  const showSpendEnvelope = (envelopeId: string | null) =>
    setRequestedSpendEnvelope(envelopeId, { history: 'replace' });

  const planSection: PlanSection = requestedSection ?? DEFAULT_PLAN_SECTION;
  const showPlanSection = (section: PlanSection) => {
    if (requestedDueBill !== null) closeDueBill();
    setRequestedSection(section === DEFAULT_PLAN_SECTION ? null : section, {
      history: 'replace',
    });
  };

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
    setRequestedMethod(null, { history: 'replace' });
    setRequestedCheckEnvelope(null, { history: 'replace' });
    setRequestedCheckFrom(null, { history: 'replace' });
  };

  /** Leaves the open full-page view for a tab in one update, so the first frame after the tap is that tab; the view's own history entry takes the plain address first, so stepping back off it lands on the screen it opened from. */
  const leaveViewForTab = (tab: RunwayTab, section?: PlanSection) => {
    const address = new URL(window.location.href);
    ['view', 'method', 'checkEnvelope', 'checkFrom'].forEach((key) =>
      address.searchParams.delete(key),
    );
    window.history.replaceState(window.history.state, '', address);
    closeView();
    if (section) showPlanSection(section);
    showTab(tab);
  };

  return {
    activeTab,
    view: requestedView,
    openView,
    closeView,
    startMethod: requestedMethod,
    setStartMethod: (method: (typeof START_METHODS)[number] | null) =>
      setRequestedMethod(method, { history: 'replace' }),
    leaveViewForTab,
    showTab,
    showSpend,
    spendEnvelope: requestedSpendEnvelope,
    purchaseId: requestedPurchase,
    checkEnvelope: requestedCheckEnvelope,
    isCheckFromFreeToSpend: requestedCheckFrom === true,
    openCheckAmount,
    closeCheckAmount,
    openCheckBalance,
    closeCheckBalance,
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
    isFixesOpen: requestedFixes === true,
    openFixes,
    closeFixes,
    dueBillId: requestedDueBill,
    openDueBill,
    closeDueBill,
    isGroupsOpen: requestedGroups === true,
    openGroups,
    closeGroups,
    spendPeriod,
    showSpendPeriod,
    daysMonth,
    showDaysMonth,
    logSpan,
    logPage,
    logItem: requestedItem,
    setLogSpan,
    setLogPage,
    setLogItem,
  };
}
