import { useAuth } from '@/hooks/useAuth';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';

function Pinch() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Pinch.' />;
  }

  return (
    <div className='page flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center'>
      <h1 className='text-foreground text-4xl font-semibold tracking-tight'>
        Pinch
      </h1>
      <p className='text-muted-foreground text-sm'>
        Your kitchen is getting set up. Check back soon.
      </p>
    </div>
  );
}

export default Pinch;
