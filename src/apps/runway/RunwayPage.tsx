import { useAuth } from '@/hooks/useAuth';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import RunwayBottomNav from '@apps/runway/components/RunwayBottomNav';
import DaysScreen from '@apps/runway/screens/days/DaysScreen';
import HomeScreen from '@apps/runway/screens/home/HomeScreen';
import PlanScreen from '@apps/runway/screens/plan/PlanScreen';
import { useRunwayTheme } from '@apps/runway/useRunwayTheme';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { RUNWAY_TAB_LABELS } from '@apps/runway/constants';

function RunwayPage() {
  const { user, loading } = useAuth();
  const { activeTab, showTab } = useRunwayUrlState();

  useRunwayTheme();
  useTrackAppUsage('runway', user?.uid ?? null);

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Runway.' />;
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
