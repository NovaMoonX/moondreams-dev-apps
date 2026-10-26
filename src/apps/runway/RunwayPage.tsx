import { useEffect, useLayoutEffect, useState } from 'react';
import { History, Loader, LockKeyhole } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import RunwayBottomNav from '@apps/runway/components/RunwayBottomNav';
import IncomeDayScreen from '@apps/runway/screens/days/IncomeDayScreen';
import DaysScreen from '@apps/runway/screens/days/DaysScreen';
import CheckAmountScreen from '@apps/runway/screens/home/CheckAmountScreen';
import FreeToSpendScreen from '@apps/runway/screens/home/FreeToSpendScreen';
import StartingOutScreen from '@apps/runway/screens/start/StartingOutScreen';
import HomeScreen from '@apps/runway/screens/home/HomeScreen';
import ChangeLogScreen from '@apps/runway/screens/plan/ChangeLogScreen';
import DeletePlanScreen from '@apps/runway/screens/plan/DeletePlanScreen';
import TrackingScreen from '@apps/runway/screens/plan/TrackingScreen';
import SettingsScreen from '@apps/runway/screens/plan/SettingsScreen';
import PlanScreen from '@apps/runway/screens/plan/PlanScreen';
import { useRunwayTheme } from '@apps/runway/useRunwayTheme';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { leaveAfterSubviewCloses } from '@apps/runway/utils/leaveAfterClose';
import { HISTORY_WORDS, RUNWAY_TAB_LABELS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import SpendScreen from '@apps/runway/screens/spend/SpendScreen';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectIsDaysLoaded,
  selectListedDays,
  selectIsPlanItemsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';
import { setKeyStatus } from '@apps/runway/store/runwaySlice';
import { useClosings } from '@apps/runway/hooks/useClosings';
import { selectHistory } from '@apps/runway/store/selectors/historySelectors';
import { useRunwaySync } from '@apps/runway/useRunwaySync';
import type { RunwayTab } from '@apps/runway/types';

const tabScrolls = new Map<RunwayTab, number>();
const RESTORE_FRAMES = 40;

const getScreen = (tab: RunwayTab) => {
  if (tab === 'days') return <DaysScreen />;
  if (tab === 'spend') return <SpendScreen />;
  if (tab === 'plan') return <PlanScreen />;
  return <HomeScreen />;
};

interface RunwayTabsProps {
  activeTab: RunwayTab;
  onChange: (tab: RunwayTab) => void;
}

/** A tab opens where it was left (the top on a first visit), and tapping the open tab again goes to its top. */
function RunwayTabs({ activeTab, onChange }: RunwayTabsProps) {
  useLayoutEffect(() => {
    const target = tabScrolls.get(activeTab) ?? 0;
    const state = { isRestoring: true, frame: 0, id: 0 };
    const stopRestoring = () => {
      state.isRestoring = false;
    };
    const restore = () => {
      if (!state.isRestoring) return;
      if (Math.abs(window.scrollY - target) >= 2) window.scrollTo(0, target);
      state.frame += 1;
      if (state.frame >= RESTORE_FRAMES) {
        state.isRestoring = false;
        return;
      }
      state.id = requestAnimationFrame(restore);
    };
    const save = () => {
      if (!state.isRestoring) tabScrolls.set(activeTab, window.scrollY);
    };
    restore();
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', stopRestoring, { passive: true });
    window.addEventListener('touchstart', stopRestoring, { passive: true });
    return () => {
      cancelAnimationFrame(state.id);
      window.removeEventListener('scroll', save);
      window.removeEventListener('wheel', stopRestoring);
      window.removeEventListener('touchstart', stopRestoring);
    };
  }, [activeTab]);

  const handleChange = (tab: RunwayTab) => {
    if (tab !== activeTab) {
      onChange(tab);
      return;
    }
    tabScrolls.set(tab, 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className='page pb-28'>
      <div className='mx-auto max-w-4xl space-y-4 py-6'>
        <h1 className='text-2xl font-semibold'>
          {RUNWAY_TAB_LABELS[activeTab]}
        </h1>
        {getScreen(activeTab)}
      </div>
      <RunwayBottomNav value={activeTab} onChange={handleChange} />
    </div>
  );
}

function RunwayPage() {
  const { user, loading } = useAuth();
  const {
    activeTab: requestedTab,
    showTab,
    openDayKey,
    closeDay,
    moreEntry,
    closeMoreEntry,
    view,
    closeView,
    settingsView,
    closeSettingsView,
    checkEnvelope,
  } = useRunwayUrlState();
  const today = todayAsUtcDate(useNow(60_000));
  const isPlanItemsLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isItemsLoaded = isPlanItemsLoaded && isDaysLoaded;
  const hasOpenDay = useAppSelector((state) => {
    if (openDayKey === null) return false;
    const { open, confirmed } = selectListedDays(state, today);
    return [...open, ...confirmed].some((day) => day.dayKey === openDayKey);
  });
  const level = useAppSelector(selectLevel);
  const activeTab =
    requestedTab === 'spend' && level === 'plan' ? 'home' : requestedTab;
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const isPlanLoaded = useAppSelector((state) => state.runway.isLoaded);
  const [attempt, setAttempt] = useState(0);

  useRunwayTheme();
  useEffect(() => () => tabScrolls.clear(), []);
  useTrackAppUsage('runway', user?.uid ?? null);
  useRunwaySync(user?.uid ?? null, attempt);
  const isDeletingPlan = moreEntry === 'settings' && settingsView === 'delete';
  const { retry: retryHistory } = useClosings(
    isDeletingPlan ? null : (user?.uid ?? null),
  );
  const historyStatus = useAppSelector((state) => selectHistory(state).status);

  const tryAgain = () => {
    dispatch(setKeyStatus('loading'));
    setAttempt((current) => current + 1);
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Runway.' />;
  }

  if (isDeletingPlan && keyStatus === 'ready') {
    return (
      <div>
        <DeletePlanScreen
          onClose={closeSettingsView}
          onDeleted={() => {
            setAttempt((current) => current + 1);
            leaveAfterSubviewCloses(() => {
              showTab('home');
              closeMoreEntry();
            });
          }}
        />
      </div>
    );
  }

  if (keyStatus === 'failed') {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl py-6'>
          <EmptyCard
            icon={<LockKeyhole className='h-5 w-5' />}
            action={
              <Button variant='secondary' size='sm' onClick={tryAgain}>
                Try again
              </Button>
            }
          >
            Your plan cannot be opened right now. Nothing has been changed or
            lost.
          </EmptyCard>
        </div>
      </div>
    );
  }

  if (
    keyStatus === 'ready' &&
    isPlanLoaded &&
    (historyStatus === 'building' || historyStatus === 'failed')
  ) {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl py-6'>
          {historyStatus === 'building' ? (
            <EmptyCard icon={<Loader className='h-5 w-5 animate-spin' />}>
              <span className='block font-medium'>
                {HISTORY_WORDS.updating}
              </span>
              <span className='block'>{HISTORY_WORDS.updatingBody}</span>
            </EmptyCard>
          ) : (
            <EmptyCard
              icon={<History className='h-5 w-5' />}
              action={
                <Button variant='secondary' size='sm' onClick={retryHistory}>
                  {HISTORY_WORDS.tryAgain}
                </Button>
              }
            >
              {HISTORY_WORDS.failed}
            </EmptyCard>
          )}
        </div>
      </div>
    );
  }

  if (keyStatus !== 'ready' || !isPlanLoaded) {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl py-6'>
          <EmptyCard icon={<Loader className='h-5 w-5 animate-spin' />}>
            Getting your plan ready.
          </EmptyCard>
        </div>
      </div>
    );
  }

  if (openDayKey !== null && (hasOpenDay || !isItemsLoaded)) {
    return (
      <div>
        <IncomeDayScreen dayKey={openDayKey} onClose={closeDay} />
      </div>
    );
  }

  if (view === 'checkAmount' && level === 'track') {
    return (
      <div>
        <CheckAmountScreen
          presetEnvelopeId={checkEnvelope}
          onClose={closeView}
        />
      </div>
    );
  }

  if (view === 'start') {
    return (
      <div>
        <StartingOutScreen />
      </div>
    );
  }

  if (view === 'freeToSpend') {
    return (
      <div>
        <FreeToSpendScreen onClose={closeView} />
      </div>
    );
  }

  if (moreEntry === 'changeLog') {
    return (
      <div>
        <ChangeLogScreen onClose={closeMoreEntry} />
      </div>
    );
  }

  if (moreEntry === 'settings' && settingsView === 'tracking') {
    return (
      <div>
        <TrackingScreen onClose={closeSettingsView} />
      </div>
    );
  }

  if (moreEntry === 'settings') {
    return (
      <div>
        <SettingsScreen onClose={closeMoreEntry} />
      </div>
    );
  }

  return <RunwayTabs activeTab={activeTab} onChange={showTab} />;
}

export default RunwayPage;
