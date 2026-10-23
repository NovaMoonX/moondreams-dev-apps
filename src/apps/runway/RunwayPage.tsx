import { useAuth } from '@/hooks/useAuth';
import { useTrackAppUsage } from '@/hooks/useTrackAppUsage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';

function RunwayPage() {
  const { user, loading } = useAuth();

  useTrackAppUsage('runway', user?.uid ?? null);

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Runway.' />;
  }

  return (
    <div className='page pt-20'>
      <h1 className='text-2xl font-semibold'>Runway</h1>
      <p className='mt-2 text-sm text-muted-foreground'>
        Your income days will show up here.
      </p>
    </div>
  );
}

export default RunwayPage;
