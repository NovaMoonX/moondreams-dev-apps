import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate } from 'react-router-dom';

import {
  DEFAULT_GOING_ONCE_TAB,
  GOING_ONCE_TABS,
  INBOX_VIEWS,
  STATUS_VIEW_PARAMS,
} from '@apps/going-once/constants';
import type { GoingOnceTab, InboxView } from '@apps/going-once/types';
import type { StatusView } from '@apps/going-once/utils/status';

const PARAM_BY_VIEW = {
  AVAILABLE: null,
  PENDING: 'pending',
  SOLD: 'sold',
} as const satisfies Record<StatusView, keyof typeof STATUS_VIEW_PARAMS | null>;

const VIEW_PARAMS = Object.keys(STATUS_VIEW_PARAMS) as [
  keyof typeof STATUS_VIEW_PARAMS,
  ...(keyof typeof STATUS_VIEW_PARAMS)[],
];

/** The open sale, its tab and the open thing, kept in the URL so a reload, a link and a return from another app land on the same screen. */
export function useGoingOnceUrlState() {
  const navigate = useNavigate();
  const [saleId, setSaleId] = useQueryState('sale', parseAsString);
  const [requestedTab, setRequestedTab] = useQueryState(
    'tab',
    parseAsStringLiteral(GOING_ONCE_TABS),
  );

  const [thingId, setThingId] = useQueryState('thing', parseAsString);
  const [requestedView, setRequestedView] = useQueryState(
    'status',
    parseAsStringLiteral(VIEW_PARAMS),
  );

  const [requestedInboxView, setRequestedInboxView] = useQueryState(
    'view',
    parseAsStringLiteral(INBOX_VIEWS),
  );
  const [inquiryId, setInquiryId] = useQueryState('inquiry', parseAsString);

  const activeTab: GoingOnceTab = requestedTab ?? DEFAULT_GOING_ONCE_TAB;
  const inboxView: InboxView = requestedInboxView ?? 'new';
  const statusView: StatusView =
    requestedView === null ? 'AVAILABLE' : STATUS_VIEW_PARAMS[requestedView];

  // nuqs writes the URL without telling the router, so an entry this hook pushes carries its own marker,
  // and closing pops it instead of stacking list → sale → list.
  const clearInbox = () => {
    void setRequestedInboxView(null, { history: 'replace' });
    void setInquiryId(null, { history: 'replace' });
  };
  const openSale = (id: string) => {
    void setRequestedTab(null, { history: 'replace' });
    void setRequestedView(null, { history: 'replace' });
    clearInbox();
    void setSaleId(id, { history: 'push' }).then(() =>
      window.history.replaceState(
        { ...window.history.state, goingOnceSaleStep: true },
        '',
      ),
    );
  };
  const openThing = (id: string) => setThingId(id, { history: 'replace' });
  const closeThing = () => setThingId(null, { history: 'replace' });
  const closeSale = () => {
    void closeThing();
    clearInbox();
    if (window.history.state?.goingOnceSaleStep) {
      navigate(-1);
      return;
    }
    void setRequestedTab(null, { history: 'replace' });
    void setRequestedView(null, { history: 'replace' });
    void setSaleId(null, { history: 'replace' });
  };
  const showStatusView = (view: StatusView) =>
    setRequestedView(PARAM_BY_VIEW[view], { history: 'replace' });
  const showThingsOn = (view: StatusView) => {
    void closeThing();
    void setRequestedTab(null, { history: 'replace' });
    return showStatusView(view);
  };
  const showThingOnThings = (id: string) => {
    clearInbox();
    void setRequestedTab(null, { history: 'replace' });
    void setRequestedView(null, { history: 'replace' });
    return openThing(id);
  };
  const showTab = (tab: GoingOnceTab) => {
    void closeThing();
    if (tab !== 'inbox') clearInbox();
    if (tab !== 'things') void setRequestedView(null, { history: 'replace' });
    return setRequestedTab(tab === DEFAULT_GOING_ONCE_TAB ? null : tab, {
      history: 'replace',
    });
  };

  const showInboxView = (view: InboxView) => {
    void setInquiryId(null, { history: 'replace' });
    return setRequestedInboxView(view === 'new' ? null : view, {
      history: 'replace',
    });
  };
  const switchInboxView = (view: InboxView) =>
    setRequestedInboxView(view === 'new' ? null : view, {
      history: 'replace',
    });
  const openInquiry = (id: string) => setInquiryId(id, { history: 'replace' });
  const closeInquiry = () => setInquiryId(null, { history: 'replace' });

  return {
    saleId,
    inquiryId,
    inboxView,
    showInboxView,
    switchInboxView,
    openInquiry,
    closeInquiry,
    thingId,
    activeTab,
    statusView,
    showStatusView,
    showThingsOn,
    showThingOnThings,
    openSale,
    closeSale,
    showTab,
    openThing,
    closeThing,
  };
}
