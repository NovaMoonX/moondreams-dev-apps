import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AppEntryFallback from '@/ui/AppEntryFallback';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import AddSubview from '@apps/a-list/components/add/AddSubview';
import CalendarScreen from '@apps/a-list/components/calendar/CalendarScreen';
import DayDrawer from '@apps/a-list/components/calendar/DayDrawer';
import DashboardScreen from '@apps/a-list/components/dashboard/DashboardScreen';
import TicketsList from '@apps/a-list/components/dashboard/TicketsList';
import ShareSubview from '@apps/a-list/components/share/ShareSubview';
import TheatersSubview from '@apps/a-list/components/theaters/TheatersSubview';
import MembershipSettingsSubview from '@apps/a-list/components/dashboard/MembershipSettingsSubview';
import PastMoviesOfferModal from '@apps/a-list/components/setup/PastMoviesOfferModal';
import SetupModal from '@apps/a-list/components/setup/SetupModal';
import BottomNav from '@apps/a-list/components/shell/BottomNav';
import DebugPanel from '@apps/a-list/components/shell/DebugPanel';
import { A_LIST_DEBUG_EMAIL } from '@apps/a-list/debug/aListDebug';
import LoadingSkeleton from '@apps/a-list/components/shell/LoadingSkeleton';
import SeenPromptHost from '@apps/a-list/components/viewing/SeenPromptHost';
import ViewingDrawer from '@apps/a-list/components/viewing/ViewingDrawer';
import WatchlistItemDrawer from '@apps/a-list/components/watchlist/WatchlistItemDrawer';
import WatchlistScreen from '@apps/a-list/components/watchlist/WatchlistScreen';
import { A_LIST_TABS, DEFAULT_A_LIST_TAB } from '@apps/a-list/constants';
import { AListOverlayContext } from '@apps/a-list/hooks/useAListOverlay';
import { useAListSync } from '@apps/a-list/hooks/useAListSync';
import { useAListTheme } from '@apps/a-list/hooks/useAListTheme';
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
  const { user } = useAuth();
  const showDebug = user?.email?.toLowerCase() === A_LIST_DEBUG_EMAIL;

  return (
    <>
      <AListScreen />
      {user && showDebug && (
        <DebugPanel uid={user.uid} email={user.email} />
      )}
    </>
  );
}

function AListScreen() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overlay, setOverlay] = useState<AListOverlay | null>(null);
  // Ephemeral: a reload simply lands on the empty calendar, whose nudge offers the same thing.
  const [isPastOfferOpen, setIsPastOfferOpen] = useState(false);
  const [isSetupDismissed, setIsSetupDismissed] = useState(false);
  const membership = useAppSelector(selectMembership);
  const isLoaded = useAppSelector(selectIsAListLoaded);
  const loadError = useAppSelector(selectAListLoadError);

  useAListTheme();
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
    if (isSetupDismissed) {
      return (
        <AppEntryFallback
          appName='A-List Tracker'
          onEnterApp={() => setIsSetupDismissed(false)}
          onBackHome={() => navigate('/')}
        />
      );
    }

    return (
      <div className='page'>
        <SetupModal
          uid={user.uid}
          onComplete={() => setIsPastOfferOpen(true)}
          onClose={() => setIsSetupDismissed(true)}
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

  const isSubviewOpen =
    overlay?.kind === 'add' ||
    overlay?.kind === 'membership' ||
    overlay?.kind === 'share' ||
    overlay?.kind === 'theaters' ||
    overlay?.kind === 'tickets';

  return (
    <AListOverlayContext.Provider value={overlayContext}>
      {overlay?.kind === 'add' && (
        <AddSubview overlay={overlay} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'tickets' && (
        <TicketsList
          initialView={overlay.view}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'share' && (
        <ShareSubview onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'theaters' && (
        <TheatersSubview onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'membership' && (
        <MembershipSettingsSubview
          membership={membership}
          onClose={() => setOverlay(null)}
        />
      )}
      {/* A subview takes over the app; the screens stay mounted underneath so filters and the selected day survive. */}
      <div className={join(isSubviewOpen && 'hidden')}>
        <div className='page pb-28'>
          <div className='mx-auto max-w-4xl space-y-4 py-6'>{getScreen()}</div>
          <BottomNav value={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      {overlay?.kind === 'day' && (
        <DayDrawer
          key={overlay.dayKey}
          dayKey={overlay.dayKey}
          onClose={() => setOverlay(null)}
        />
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
        <PastMoviesOfferModal
          onSkip={() => setIsPastOfferOpen(false)}
          onAccept={() => {
            setIsPastOfferOpen(false);
            setOverlay({
              kind: 'add',
              destination: 'calendar',
              date: getYesterdayKey(),
              mode: 'past',
            });
          }}
        />
      )}
      {!isPastOfferOpen && <SeenPromptHost />}
    </AListOverlayContext.Provider>
  );
}

export default AList;
