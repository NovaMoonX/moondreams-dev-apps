import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, Inbox, Store, Tag } from 'lucide-react';
import type { ReactNode } from 'react';

import EmptyCard from '@/components/EmptyCard';
import IconBadge from '@/components/IconBadge';
import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen, useLoadFeatureGates } from '@/hooks/useFeatureGates';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import { useAppDispatch, useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import InboxTab from '@apps/going-once/components/inbox/InboxTab';
import CoSellerIntro from '@apps/going-once/components/people/CoSellerIntro';
import RemovedFromSale from '@apps/going-once/components/people/RemovedFromSale';
import ItemsSection from '@apps/going-once/components/things/ItemsSection';
import SaleFormSheet from '@apps/going-once/components/sales/SaleFormSheet';
import SaleTab from '@apps/going-once/components/sales/SaleTab';
import SalesList from '@apps/going-once/components/sales/SalesList';
import {
  CREATE_SALES_GATE_ID,
  GOING_ONCE_TAB_LABELS,
  GOING_ONCE_TABS,
} from '@apps/going-once/constants';
import { useGoingOnceSync } from '@apps/going-once/hooks/useGoingOnceSync';
import { useGoingOnceTheme } from '@apps/going-once/hooks/useGoingOnceTheme';
import { useJoinFromInvites } from '@apps/going-once/hooks/useJoinFromInvites';
import { useSaleTimeZoneBackfill } from '@apps/going-once/hooks/useSaleTimeZoneBackfill';
import { useGoingOnceUrlState } from '@apps/going-once/hooks/useGoingOnceUrlState';
import { setRemovedFrom, type RemovedFrom } from '@apps/going-once/store';
import {
  selectMyInvites,
  selectNewInquiries,
  selectRemovedFrom,
  selectSaleById,
  selectSales,
  selectSalesStatus,
} from '@apps/going-once/store/selectors';
import type {
  GoingOnceTab,
  Sale,
  SaleEmailInvite,
} from '@apps/going-once/types';

const getTabIcon = (tab: GoingOnceTab, newCount: number): ReactNode => {
  if (tab === 'things') return <Tag className='h-5 w-5' />;
  if (tab === 'sale') return <Store className='h-5 w-5' />;
  return <IconBadge icon={<Inbox className='h-5 w-5' />} count={newCount} />;
};

/** A floating pill at the bottom of the screen with the sale's three tabs. */
function SaleTabs({
  value,
  newCount,
  onChange,
}: {
  value: GoingOnceTab;
  newCount: number;
  onChange: (tab: GoingOnceTab) => void;
}) {
  return (
    <nav
      aria-label='Sale sections'
      data-bottom-bar
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
                aria-label={`${GOING_ONCE_TAB_LABELS[tab]} tab${tab === 'inbox' && newCount > 0 ? `, ${newCount} new` : ''}`}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(tab)}
                className={join(
                  'focus-visible:outline-foreground! h-auto w-full min-w-0 flex-col gap-0.5 rounded-full! px-1! py-2 text-[11px] font-medium focus:outline-transparent! focus-visible:outline-2 sm:px-4!',
                  isSelected
                    ? 'bg-accent text-accent-foreground! font-semibold'
                    : 'text-muted-foreground!',
                )}
              >
                {getTabIcon(tab, newCount)}
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
  if (saleId === null && sales.length === 1) return sales[0].id;
  return null;
}

/** A `?sale=` link to a sale that isn't in the person's sales (and that they aren't about to join): the same card as a removal, with nothing known about the sale. */
function toUnreadableLink(
  saleId: string | null,
  sales: Sale[],
  invites: SaleEmailInvite[],
  isListChosen: boolean,
): RemovedFrom | null {
  if (saleId === null || isListChosen) return null;
  if (sales.some((sale) => sale.id === saleId)) return null;
  if (invites.some((invite) => invite.saleId === saleId)) return null;
  return { saleId, name: null, ownerUid: null };
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
  const {
    saleId,
    thingId,
    inquiryId,
    inboxView,
    showInboxView,
    switchInboxView,
    openInquiry,
    closeInquiry,
    activeTab,
    statusView,
    showStatusView,
    showThingsOn,
    openSale,
    closeSale,
    showTab,
    openThing,
    closeThing,
  } = useGoingOnceUrlState();
  const sales = useAppSelector(selectSales);
  const salesStatus = useAppSelector(selectSalesStatus);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isListChosen, setIsListChosen] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const changeTab = (tab: GoingOnceTab) => {
    setResumeId(null);
    return showTab(tab);
  };

  const openSaleId = pickOpenSaleId(
    sales,
    saleId,
    salesStatus === 'ready',
    isListChosen,
  );
  const verifiedEmail = user?.emailVerified ? (user.email ?? null) : null;
  useGoingOnceSync(uid, verifiedEmail, openSaleId);
  useJoinFromInvites(uid);
  const dispatch = useAppDispatch();
  const storedRemoval = useAppSelector(selectRemovedFrom);
  const myInvites = useAppSelector(selectMyInvites);
  const sale = useAppSelector((state) => selectSaleById(state, openSaleId));
  useSaleTimeZoneBackfill(sale, uid);
  const newInquiryCount = useAppSelector(
    (state) => selectNewInquiries(state, openSaleId).length,
  );

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

  const removedFrom =
    storedRemoval ?? toUnreadableLink(saleId, sales, myInvites, isListChosen);

  if (removedFrom) {
    return (
      <RemovedFromSale
        saleName={removedFrom.name}
        sellerUid={removedFrom.ownerUid}
        onBack={() => {
          dispatch(setRemovedFrom(null));
          setIsListChosen(true);
          closeSale();
        }}
      />
    );
  }

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
            <CoSellerIntro sale={sale} uid={user.uid} />
            {activeTab === 'things' && (
              <ItemsSection
                saleId={sale.id}
                uid={user.uid}
                openId={thingId}
                onOpenThing={openThing}
                onCloseThing={closeThing}
                statusView={statusView}
                onStatusViewChange={showStatusView}
                resumeId={resumeId}
                onResumeTaken={() => setResumeId(null)}
              />
            )}
            {activeTab === 'sale' && (
              <SaleTab
                sale={sale}
                uid={user.uid}
                myEmail={user.email}
                onLeft={() => {
                  setIsListChosen(true);
                  closeSale();
                }}
                onOpenStatus={showThingsOn}
                onDeleted={() => {
                  setIsListChosen(true);
                  closeSale();
                }}
              />
            )}
            {activeTab === 'inbox' && (
              <InboxTab
                saleId={sale.id}
                uid={user.uid}
                view={inboxView}
                onViewChange={showInboxView}
                onSwitchView={switchInboxView}
                openId={inquiryId}
                onOpen={openInquiry}
                onClose={closeInquiry}
                openThingId={thingId}
                onOpenThing={openThing}
                onCloseThing={closeThing}
                onFinishThing={(id) => {
                  setResumeId(id);
                  void showTab('things');
                }}
                onOpenSale={() => changeTab('sale')}
              />
            )}
          </div>
          <SaleTabs
            value={activeTab}
            newCount={newInquiryCount}
            onChange={changeTab}
          />
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
