import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';

import {
  DEFAULT_GOING_ONCE_TAB,
  GOING_ONCE_TABS,
} from '@apps/going-once/constants';
import type { GoingOnceTab } from '@apps/going-once/types';

/** The open sale and its tab, kept in the URL so a reload, a link and a return from another app land on the same screen. */
export function useGoingOnceUrlState() {
  const [saleId, setSaleId] = useQueryState('sale', parseAsString);
  const [requestedTab, setRequestedTab] = useQueryState(
    'tab',
    parseAsStringLiteral(GOING_ONCE_TABS),
  );

  const activeTab: GoingOnceTab = requestedTab ?? DEFAULT_GOING_ONCE_TAB;

  const openSale = (id: string) => {
    void setRequestedTab(null, { history: 'replace' });
    void setSaleId(id, { history: 'push' });
  };
  const closeSale = () => {
    void setRequestedTab(null, { history: 'replace' });
    void setSaleId(null, { history: 'push' });
  };
  const showTab = (tab: GoingOnceTab) =>
    setRequestedTab(tab === DEFAULT_GOING_ONCE_TAB ? null : tab, {
      history: 'replace',
    });

  return { saleId, activeTab, openSale, closeSale, showTab };
}
