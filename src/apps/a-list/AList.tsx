import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';
import AddDrawer from '@apps/a-list/components/add/AddDrawer';
import SeenPromptHost from '@apps/a-list/components/viewing/SeenPromptHost';
import ViewingDrawer from '@apps/a-list/components/viewing/ViewingDrawer';
import CalendarScreen from '@apps/a-list/components/calendar/CalendarScreen';
import DashboardScreen from '@apps/a-list/components/dashboard/DashboardScreen';
import SetupModal from '@apps/a-list/components/setup/SetupModal';
import BottomNav from '@apps/a-list/components/shell/BottomNav';
import LoadingSkeleton from '@apps/a-list/components/shell/LoadingSkeleton';
import WatchlistItemDrawer from '@apps/a-list/components/watchlist/WatchlistItemDrawer';
import WatchlistScreen from '@apps/a-list/components/watchlist/WatchlistScreen';
import { A_LIST_TABS, DEFAULT_A_LIST_TAB } from '@apps/a-list/constants';
import { AListOverlayContext } from '@apps/a-list/hooks/useAListOverlay';
import { useAListSync } from '@apps/a-list/hooks/useAListSync';
import { useRefreshUnreleasedMovies } from '@apps/a-list/hooks/useRefreshUnreleasedMovies';
import {
  selectIsAListLoaded,
  selectMembership,
  selectAListLoadError,
} from '@apps/a-list/store/selectors';
import type { AListOverlay, AListTab } from '@apps/a-list/types';
import { getDayKey } from '@apps/a-list/utils/dayKeys';

function getYesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getDayKey(yesterday.getTime());
}

function AList() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overlay, setOverlay] = useState<AListOverlay | null>(null);
  // Ephemeral: a reload simply lands on the empty calendar, whose nudge offers the same thing.
  const [isPastOfferOpen, setIsPastOfferOpen] = useState(false);
  const membership = useAppSelector(selectMembership);
  const isLoaded = useAppSelector(selectIsAListLoaded);
  const loadError = useAppSelector(selectAListLoadError);

  useAListSync(user?.uid ?? null);
  useRefreshUnreleasedMovies(
    user?.uid ?? null,
    isLoaded && !loadError && membership !== null,
  );

  const requestedTab = searchParams.get('tab');
  const activeTab: AListTab =
    A_LIST_TABS.find((tab) => tab === requestedTab) ?? DEFAULT_A_LIST_TAB;

  const setActiveTab = (tab: AListTab) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (tab === DEFAULT_A_LIST_TAB) {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', tab);
    }
    setSearchParams(nextSearchParams);
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return (
      <AuthRequiredState message='Please sign in to use A-List Tracker.' />
    );
  }

  if (!isLoaded) {
    return <LoadingSkeleton />;
  }

  if (loadError) {
    return (
      <div className='page flex items-center justify-center'>
        <div className='max-w-sm space-y-3 text-center'>
          <p className='font-medium'>We couldn't load your A-List just now.</p>
          <p className='text-muted-foreground text-sm'>
            Check your connection and give it another try.
          </p>
          <Button type='button' onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className='page'>
        <SetupModal
          uid={user.uid}
          onComplete={() => setIsPastOfferOpen(true)}
        />
      </div>
    );
  }

  const getScreen = () => {
    if (activeTab === 'dashboard')
      return <DashboardScreen membership={membership} />;
    if (activeTab === 'watchlist') return <WatchlistScreen />;
    return <CalendarScreen />;
  };

  const overlayContext = {
    overlay,
    openOverlay: setOverlay,
    closeOverlay: () => setOverlay(null),
  };

  return (
    <AListOverlayContext.Provider value={overlayContext}>
      <div className='page pb-28'>
        <div className='mx-auto max-w-4xl space-y-4 py-6'>
          <NavButton href='/' variant='link'>
            <ChevronLeft /> Back home
          </NavButton>
          {getScreen()}
        </div>
        <BottomNav value={activeTab} onChange={setActiveTab} />
      </div>
      {overlay?.kind === 'add' && (
        <AddDrawer overlay={overlay} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'viewing' && (
        <ViewingDrawer
          key={overlay.id}
          viewingId={overlay.id}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'watchlistItem' && (
        <WatchlistItemDrawer
          key={overlay.movieKey}
          movieKey={overlay.movieKey}
          onClose={() => setOverlay(null)}
        />
      )}
      {isPastOfferOpen && overlay === null && (
        <Modal
          isOpen
          onClose={() => setIsPastOfferOpen(false)}
          title='Add movies you have already seen?'
        >
          <div className='space-y-4'>
            <p className='text-muted-foreground text-sm'>
              Backfill what you've watched since you joined, and your savings
              start out accurate instead of at zero.
            </p>
            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='secondary'
                onClick={() => setIsPastOfferOpen(false)}
              >
                Skip
              </Button>
              <Button
                type='button'
                onClick={() => {
                  setIsPastOfferOpen(false);
                  setOverlay({
                    kind: 'add',
                    destination: 'calendar',
                    date: getYesterdayKey(),
                    mode: 'past',
                  });
                }}
              >
                Add past movies
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {!isPastOfferOpen && <SeenPromptHost />}
    </AListOverlayContext.Provider>
  );
}

export default AList;
