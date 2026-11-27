import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AppAskingMark from '@/components/AppAskingMark';
import AppEnteredMark from '@/components/AppEnteredMark';
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
import ProjectionSubview from '@apps/a-list/components/dashboard/ProjectionSubview';
import MembershipSettingsSubview from '@apps/a-list/components/dashboard/MembershipSettingsSubview';
import PastMoviesOfferModal from '@apps/a-list/components/setup/PastMoviesOfferModal';
import SetupModal from '@apps/a-list/components/setup/SetupModal';
import BottomNav from '@apps/a-list/components/shell/BottomNav';
import LoadingSkeleton from '@apps/a-list/components/shell/LoadingSkeleton';
import SeenPromptHost from '@apps/a-list/components/viewing/SeenPromptHost';
import ViewingDrawer from '@apps/a-list/components/viewing/ViewingDrawer';
import WatchlistItemDrawer from '@apps/a-list/components/watchlist/WatchlistItemDrawer';
import WatchlistScreen from '@apps/a-list/components/watchlist/WatchlistScreen';
import {
  A_LIST_TABS,
  DEFAULT_A_LIST_TAB,
  EMAIL_TICKETS_GATE_ID,
} from '@apps/a-list/constants';
import { AListOverlayContext } from '@apps/a-list/hooks/useAListOverlay';
import EmailTicketsSubview from '@apps/a-list/components/email/EmailTicketsSubview';
import { useIsGateOpen, useLoadFeatureGates } from '@/hooks/useFeatureGates';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import { useAListEmailSync } from '@apps/a-list/hooks/useAListEmailSync';
import { useAListSync } from '@apps/a-list/hooks/useAListSync';
import { useAListTheme } from '@apps/a-list/hooks/useAListTheme';
import { useRefreshUnreleasedMovies } from '@apps/a-list/hooks/useRefreshUnreleasedMovies';
import {
  selectIsAListLoaded,
  selectMembership,
  selectAListLoadError,
  selectViewingById,
} from '@apps/a-list/store/selectors';
import type { AListOverlay, AListTab } from '@apps/a-list/types';
import { getDayKey } from '@apps/a-list/utils/dayKeys';

// Page-sized screens live in the URL so a reload lands on them; drawers and the add flow stay in memory.
const A_LIST_URL_VIEWS = [
  'settings',
  'email',
  'settings-email',
  'projection',
  'share',
  'theaters',
  'paid-tickets',
  'unpriced-tickets',
] as const;
type AListUrlView = (typeof A_LIST_URL_VIEWS)[number];

const toUrlOverlay = (view: AListUrlView): AListOverlay => {
  if (view === 'settings') return { kind: 'membership' };
  if (view === 'email') return { kind: 'emailTickets' };
  if (view === 'settings-email')
    return { kind: 'emailTickets', returnTo: 'membership' };
  if (view === 'paid-tickets') return { kind: 'tickets', view: 'paid' };
  if (view === 'unpriced-tickets') return { kind: 'tickets', view: 'unpriced' };
  return { kind: view };
};

const toUrlView = (overlay: AListOverlay): AListUrlView | null => {
  if (overlay.kind === 'membership') return 'settings';
  if (overlay.kind === 'emailTickets')
    return overlay.returnTo === 'membership' ? 'settings-email' : 'email';
  if (overlay.kind === 'tickets') return `${overlay.view}-tickets`;
  if (
    overlay.kind === 'projection' ||
    overlay.kind === 'share' ||
    overlay.kind === 'theaters'
  )
    return overlay.kind;
  return null;
};

function getYesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getDayKey(yesterday.getTime());
}

function AList() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [heldOverlay, setHeldOverlay] = useState<AListOverlay | null>(null);
  const [urlView, setUrlView] = useQueryState(
    'view',
    parseAsStringLiteral(A_LIST_URL_VIEWS),
  );
  const linkedViewingId = searchParams.get('viewing');
  const isLinkedViewingKnown = useAppSelector(
    (state) =>
      linkedViewingId !== null &&
      selectViewingById(state, linkedViewingId) !== null,
  );
  // Ephemeral: a reload simply lands on the empty calendar, whose nudge offers the same thing.
  const [isPastOfferOpen, setIsPastOfferOpen] = useState(false);
  const [isSetupDismissed, setIsSetupDismissed] = useState(false);
  const membership = useAppSelector(selectMembership);
  const isLoaded = useAppSelector(selectIsAListLoaded);
  const loadError = useAppSelector(selectAListLoadError);

  useAListTheme();
  useAListSync(user?.uid ?? null);
  useLoadFeatureGates('a-list', user?.uid ?? null);
  const isEmailGateOpen = useIsGateOpen('a-list', EMAIL_TICKETS_GATE_ID);
  useAListEmailSync(
    user?.uid ?? null,
    isEmailGateOpen && isLoaded && !loadError && membership !== null,
  );
  useTrackAppUsage('a-list', user?.uid ?? null);
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

  const openedOverlay = urlView === null ? heldOverlay : toUrlOverlay(urlView);

  const setOverlay = (next: AListOverlay | null) => {
    const view = next === null ? null : toUrlView(next);
    setHeldOverlay(view === null ? next : null);
    void setUrlView(view, { history: 'replace' });
  };

  // A link to a showing deleted since it was shared opens nothing rather than an empty sheet.
  const overlay: AListOverlay | null =
    (openedOverlay?.kind === 'emailTickets' && !isEmailGateOpen
      ? null
      : openedOverlay) ??
    (linkedViewingId !== null && isLinkedViewingKnown
      ? { kind: 'viewing', id: linkedViewingId }
      : null);

  const closeOverlay = () => {
    setOverlay(null);
    if (!searchParams.has('viewing')) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('viewing');
    nextSearchParams.delete('view');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const getScreen = () => {
    if (activeTab === 'dashboard')
      return <DashboardScreen membership={membership} />;
    if (activeTab === 'watchlist') return <WatchlistScreen />;
    return <CalendarScreen />;
  };

  const overlayContext = {
    overlay,
    openOverlay: setOverlay,
    closeOverlay,
  };

  const isSubviewOpen =
    overlay?.kind === 'add' ||
    overlay?.kind === 'membership' ||
    overlay?.kind === 'emailTickets' ||
    overlay?.kind === 'projection' ||
    overlay?.kind === 'share' ||
    overlay?.kind === 'theaters' ||
    overlay?.kind === 'tickets';

  return (
    <AListOverlayContext.Provider value={overlayContext}>
      <AppEnteredMark scope='a-list' />
      {overlay?.kind === 'add' && (
        <AddSubview overlay={overlay} onClose={closeOverlay} />
      )}
      {overlay?.kind === 'tickets' && (
        <TicketsList initialView={overlay.view} onClose={closeOverlay} />
      )}
      {overlay?.kind === 'share' && <ShareSubview onClose={closeOverlay} />}
      {overlay?.kind === 'theaters' && (
        <TheatersSubview onClose={closeOverlay} />
      )}
      {overlay?.kind === 'projection' && (
        <ProjectionSubview membership={membership} onClose={closeOverlay} />
      )}
      {overlay?.kind === 'emailTickets' && (
        <EmailTicketsSubview
          onClose={() =>
            overlay.returnTo === 'membership'
              ? setOverlay({ kind: 'membership' })
              : closeOverlay()
          }
        />
      )}
      {overlay?.kind === 'membership' && (
        <MembershipSettingsSubview
          membership={membership}
          onClose={closeOverlay}
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
          onClose={closeOverlay}
        />
      )}
      {overlay?.kind === 'viewing' && (
        <ViewingDrawer
          key={overlay.id}
          viewingId={overlay.id}
          onClose={closeOverlay}
        />
      )}
      {overlay?.kind === 'watchlistItem' && (
        <WatchlistItemDrawer
          key={overlay.movieKey}
          movieKey={overlay.movieKey}
          onClose={closeOverlay}
        />
      )}
      {isPastOfferOpen && overlay === null && <AppAskingMark scope='a-list' />}
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
