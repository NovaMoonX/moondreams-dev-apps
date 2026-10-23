import { useState } from 'react';
import { Loader, LockKeyhole } from 'lucide-react';

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
import FreeToSpendScreen from '@apps/runway/screens/home/FreeToSpendScreen';
import StartingOutScreen from '@apps/runway/screens/start/StartingOutScreen';
import HomeScreen from '@apps/runway/screens/home/HomeScreen';
import SettingsScreen from '@apps/runway/screens/plan/SettingsScreen';
import PlanScreen from '@apps/runway/screens/plan/PlanScreen';
import { useRunwayTheme } from '@apps/runway/useRunwayTheme';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { RUNWAY_TAB_LABELS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectIsDaysLoaded,
  selectListedDays,
  selectIsPlanItemsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';
import { setKeyStatus } from '@apps/runway/store/runwaySlice';
import { useRunwaySync } from '@apps/runway/useRunwaySync';

function RunwayPage() {
  const { user, loading } = useAuth();
  const {
    activeTab,
    showTab,
    openDayKey,
    closeDay,
    moreEntry,
    closeMoreEntry,
    view,
    closeView,
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
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const isPlanLoaded = useAppSelector((state) => state.runway.isLoaded);
  const [attempt, setAttempt] = useState(0);

  useRunwayTheme();
  useTrackAppUsage('runway', user?.uid ?? null);
  useRunwaySync(user?.uid ?? null, attempt);

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
      <div className='page'>
        <IncomeDayScreen dayKey={openDayKey} onClose={closeDay} />
      </div>
    );
  }

  if (view === 'start') {
    return (
      <div className='page'>
        <StartingOutScreen />
      </div>
    );
  }

  if (view === 'freeToSpend') {
    return (
      <div className='page'>
        <FreeToSpendScreen onClose={closeView} />
      </div>
    );
  }

  if (moreEntry === 'settings') {
    return (
      <div className='page'>
        <SettingsScreen onClose={closeMoreEntry} />
      </div>
    );
  }

  const getScreen = () => {
    if (activeTab === 'days') return <DaysScreen />;
    if (activeTab === 'plan') return <PlanScreen />;
    return <HomeScreen />;
  };

  return (
    <div className='page pb-28'>
      <div className='mx-auto max-w-4xl space-y-4 py-6'>
        <h1 className='text-2xl font-semibold'>
          {RUNWAY_TAB_LABELS[activeTab]}
        </h1>
        {getScreen()}
      </div>
      <RunwayBottomNav value={activeTab} onChange={showTab} />
    </div>
  );
}

export default RunwayPage;
