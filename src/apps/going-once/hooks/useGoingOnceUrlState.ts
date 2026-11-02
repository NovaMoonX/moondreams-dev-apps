import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate } from 'react-router-dom';

import {
  DEFAULT_GOING_ONCE_TAB,
  GOING_ONCE_TABS,
} from '@apps/going-once/constants';
import type { GoingOnceTab } from '@apps/going-once/types';

/** The open sale, its tab and the open thing, kept in the URL so a reload, a link and a return from another app land on the same screen. */
export function useGoingOnceUrlState() {
  const navigate = useNavigate();
  const [saleId, setSaleId] = useQueryState('sale', parseAsString);
  const [requestedTab, setRequestedTab] = useQueryState(
    'tab',
    parseAsStringLiteral(GOING_ONCE_TABS),
  );

  const [thingId, setThingId] = useQueryState('thing', parseAsString);

  const activeTab: GoingOnceTab = requestedTab ?? DEFAULT_GOING_ONCE_TAB;

  // nuqs writes the URL without telling the router, so an entry this hook pushes carries its own marker,
  // and closing pops it instead of stacking list → sale → list.
  const openSale = (id: string) => {
    void setRequestedTab(null, { history: 'replace' });
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
    if (window.history.state?.goingOnceSaleStep) {
      navigate(-1);
      return;
    }
    void setRequestedTab(null, { history: 'replace' });
    void setSaleId(null, { history: 'replace' });
  };
  const showTab = (tab: GoingOnceTab) => {
    void closeThing();
    return setRequestedTab(tab === DEFAULT_GOING_ONCE_TAB ? null : tab, {
      history: 'replace',
    });
  };

  return {
    saleId,
    thingId,
    activeTab,
    openSale,
    closeSale,
    showTab,
    openThing,
    closeThing,
  };
}
