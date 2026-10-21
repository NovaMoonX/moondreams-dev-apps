import { useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import CalendarScreen from '@apps/pinch/components/calendar/CalendarScreen';
import KitchenScreen from '@apps/pinch/components/kitchen/KitchenScreen';
import RecipesScreen from '@apps/pinch/components/recipes/RecipesScreen';
import BottomNav from '@apps/pinch/components/shell/BottomNav';
import LoadingSkeleton from '@apps/pinch/components/shell/LoadingSkeleton';
import { DEFAULT_PINCH_TAB, PINCH_TABS } from '@apps/pinch/constants';
import { usePinchSync } from '@apps/pinch/hooks/usePinchSync';
import { usePinchTheme } from '@apps/pinch/hooks/usePinchTheme';
import {
  selectIsPinchLoaded,
  selectPinchLoadError,
} from '@apps/pinch/store/selectors';
import type { PinchTab } from '@apps/pinch/types';

function Pinch() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  const isLoaded = useAppSelector(selectIsPinchLoaded);
  const loadError = useAppSelector(selectPinchLoadError);

  usePinchTheme();
  usePinchSync(user?.uid ?? null);

  const requestedTab = searchParams.get('tab');
  const activeTab: PinchTab =
    PINCH_TABS.find((tab) => tab === requestedTab) ?? DEFAULT_PINCH_TAB;

  const setActiveTab = (tab: PinchTab) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (tab === DEFAULT_PINCH_TAB) {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', tab);
    }
    startTransition(() => setSearchParams(nextSearchParams));
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Pinch.' />;
  }

  if (!isLoaded) {
    return <LoadingSkeleton />;
  }

  if (loadError) {
    return (
      <div className='page flex items-center justify-center'>
        <div className='max-w-sm space-y-3 text-center'>
          <p className='font-medium'>We couldn't load your kitchen just now.</p>
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

  const getScreen = () => {
    if (activeTab === 'recipes') return <RecipesScreen />;
    if (activeTab === 'kitchen') return <KitchenScreen uid={user.uid} />;
    return <CalendarScreen />;
  };

  return (
    <div className='page pb-28'>
      <div className='mx-auto max-w-4xl space-y-4 py-6'>{getScreen()}</div>
      <BottomNav value={activeTab} onChange={setActiveTab} />
    </div>
  );
}

export default Pinch;
