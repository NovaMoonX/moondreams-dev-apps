import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { WATCH_PRIORITY_LABELS, WATCHLIST_TABS } from '@apps/a-list/constants';
import type { WatchlistTab } from '@apps/a-list/types';

interface WatchlistTabsProps {
  value: WatchlistTab;
  openingCount: number;
  onChange: (value: WatchlistTab) => void;
}

function getTabLabel(tab: WatchlistTab) {
  if (tab === 'opening') return 'Opening';
  if (tab === 'all') return 'All';
  if (tab === 'seen') return 'Seen';
  return WATCH_PRIORITY_LABELS[tab];
}

/** Six tabs in one strip that scrolls sideways on a phone, so every label stays whole. */
function WatchlistTabs({ value, openingCount, onChange }: WatchlistTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as WatchlistTab)}
      tabsWidth='fit'
    >
      <div className='-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0'>
        <TabsList className='w-max'>
          {WATCHLIST_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className='whitespace-nowrap'>
              <span
                className={join(
                  tab === 'opening' &&
                    openingCount > 0 &&
                    'text-primary font-semibold',
                )}
              >
                {getTabLabel(tab)}
              </span>
              {tab === 'opening' && openingCount > 0 && (
                <span className='bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[11px] font-semibold'>
                  {openingCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

export default WatchlistTabs;
