import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, Inbox, Store, Tag } from 'lucide-react';
import type { ReactNode } from 'react';

import EmptyCard from '@/components/EmptyCard';
import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen, useLoadFeatureGates } from '@/hooks/useFeatureGates';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import { useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import SaleFormSheet from '@apps/going-once/components/sales/SaleFormSheet';
import SalesList from '@apps/going-once/components/sales/SalesList';
import {
  CREATE_SALES_GATE_ID,
  GOING_ONCE_TAB_LABELS,
  GOING_ONCE_TABS,
} from '@apps/going-once/constants';
import { useGoingOnceSync } from '@apps/going-once/hooks/useGoingOnceSync';
import { useGoingOnceTheme } from '@apps/going-once/hooks/useGoingOnceTheme';
import { useGoingOnceUrlState } from '@apps/going-once/hooks/useGoingOnceUrlState';
import {
  selectSaleById,
  selectSales,
  selectSalesStatus,
} from '@apps/going-once/store/selectors';
import type { GoingOnceTab, Sale } from '@apps/going-once/types';

const TAB_ICONS: Record<GoingOnceTab, ReactNode> = {
  things: <Tag className='h-5 w-5' />,
  inbox: <Inbox className='h-5 w-5' />,
  sale: <Store className='h-5 w-5' />,
};

const TAB_PLACEHOLDERS: Record<GoingOnceTab, { icon: string; text: string }> = {
  things: {
    icon: '🏷️',
    text: 'The things you add to this sale will show here.',
  },
  inbox: {
    icon: '📬',
    text: 'When someone is interested in a thing, their message will land here.',
  },
  sale: {
    icon: '🧾',
    text: 'Where the sale stands, who is helping and its details will live here.',
  },
};

/** A floating pill at the bottom of the screen with the sale's three tabs. */
function SaleTabs({
  value,
  onChange,
}: {
  value: GoingOnceTab;
  onChange: (tab: GoingOnceTab) => void;
}) {
  return (
    <nav
      aria-label='Sale sections'
      className='fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-20 max-w-[calc(100vw-2rem)] -translate-x-1/2'
    >
      <ul className='border-border bg-background flex items-center gap-1 rounded-full border p-1.5 shadow-lg'>
        {GOING_ONCE_TABS.map((tab) => {
          const isSelected = value === tab;
          return (
            <li key={tab} className='w-[4.5rem] min-w-0 sm:w-20'>
              <Button
                type='button'
                variant='tertiary'
                aria-label={`${GOING_ONCE_TAB_LABELS[tab]} tab`}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(tab)}
                className={join(
                  'focus-visible:outline-foreground! h-auto w-full min-w-0 flex-col gap-0.5 rounded-full! px-1! py-2 text-[11px] font-medium focus:outline-transparent! focus-visible:outline-2 sm:px-4!',
                  isSelected
                    ? 'bg-accent text-accent-foreground! font-semibold'
                    : 'text-muted-foreground!',
                )}
              >
                {TAB_ICONS[tab]}
                {GOING_ONCE_TAB_LABELS[tab]}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function pickOpenSaleId(
  sales: Sale[],
  saleId: string | null,
  isReady: boolean,
  isListChosen: boolean,
): string | null {
  if (!isReady) return null;
  if (isListChosen && saleId === null) return null;
  if (sales.some((sale) => sale.id === saleId)) return saleId;
  if (sales.length === 1) return sales[0].id;
  return null;
}

function GoingOnce() {
  useGoingOnceTheme();
  const { user, loading } = useAuth();
  const uid = user?.uid ?? null;
  useTrackAppUsage('going-once', uid);
  useLoadFeatureGates('going-once', uid);
  const canCreateSales = useIsGateOpen('going-once', CREATE_SALES_GATE_ID);
  const areGatesRead = useAppSelector(
    (state) => state.featureGates.byApp['going-once'] !== undefined,
  );
  const { saleId, activeTab, openSale, closeSale, showTab } =
    useGoingOnceUrlState();
  const sales = useAppSelector(selectSales);
  const salesStatus = useAppSelector(selectSalesStatus);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isListChosen, setIsListChosen] = useState(false);

  const openSaleId = pickOpenSaleId(
    sales,
    saleId,
    salesStatus === 'ready',
    isListChosen,
  );
  useGoingOnceSync(uid, openSaleId);
  const sale = useAppSelector((state) => selectSaleById(state, openSaleId));

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Going Once.' />;
  }

  if (salesStatus === 'loading' || !areGatesRead) {
    return <Loading />;
  }

  if (salesStatus === 'error') {
    return (
      <div className='page'>
        <div className='mx-auto max-w-2xl'>
          <EmptyCard icon='⚠️'>
            We couldn&apos;t load your sales. Check your connection and refresh
            the page.
          </EmptyCard>
        </div>
      </div>
    );
  }

  const placeholder = TAB_PLACEHOLDERS[activeTab];

  return (
    <>
      {sale ? (
        <div className='page'>
          <div className='mx-auto max-w-2xl space-y-4 pb-28'>
            <header className='flex items-center gap-2'>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Your sales'
                className='text-foreground! -ml-2 size-10 min-w-10 shrink-0 p-0'
                onClick={() => {
                  setIsListChosen(true);
                  closeSale();
                }}
              >
                <ChevronLeft className='size-6' aria-hidden='true' />
              </Button>
              <div className='min-w-0'>
                <h1 className='line-clamp-2 text-[22px] font-semibold break-words'>
                  {sale.name}
                </h1>
                {sale.pickupArea && (
                  <p className='text-muted-foreground truncate text-sm'>
                    {sale.pickupArea}
                  </p>
                )}
              </div>
            </header>
            <EmptyCard icon={placeholder.icon}>{placeholder.text}</EmptyCard>
          </div>
          <SaleTabs value={activeTab} onChange={showTab} />
        </div>
      ) : (
        <SalesList
          sales={sales}
          canCreate={canCreateSales}
          onOpen={(id) => {
            setIsListChosen(false);
            openSale(id);
          }}
          onNew={() => setIsStartOpen(true)}
        />
      )}
      <SaleFormSheet
        key={isStartOpen ? 'open' : 'closed'}
        isOpen={isStartOpen}
        uid={user.uid}
        onClose={() => setIsStartOpen(false)}
        onStarted={(id) => {
          setIsListChosen(false);
          openSale(id);
        }}
      />
    </>
  );
}

export default GoingOnce;
