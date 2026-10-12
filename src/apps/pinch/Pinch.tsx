import { useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import AuthRequiredState from '@/ui/AuthRequiredState';
import CalendarScreen from '@apps/pinch/components/calendar/CalendarScreen';
import KitchenScreen from '@apps/pinch/components/kitchen/KitchenScreen';
import RecipesScreen from '@apps/pinch/components/recipes/RecipesScreen';
import BottomNav from '@apps/pinch/components/shell/BottomNav';
import LoadingSkeleton from '@apps/pinch/components/shell/LoadingSkeleton';
import { DEFAULT_PINCH_TAB, PINCH_TABS } from '@apps/pinch/constants';
import { usePinchTheme } from '@apps/pinch/hooks/usePinchTheme';
import type { PinchTab } from '@apps/pinch/types';

function Pinch() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  usePinchTheme();

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

  const getScreen = () => {
    if (activeTab === 'recipes') return <RecipesScreen />;
    if (activeTab === 'kitchen') return <KitchenScreen />;
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
