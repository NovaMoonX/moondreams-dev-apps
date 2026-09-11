import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import Loading from '@/ui/Loading';

import HouseholdSetupModal from './components/HouseholdSetupModal';
import { createHousehold } from './store/actions/householdsActions';
import { useNineLivesSync } from './hooks/useNineLivesSync';
import AuthRequiredState from '@/ui/AuthRequiredState';

function NineLives() {
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentHousehold = useAppSelector((state) => {
    if (!user?.uid) {
      return null;
    }

    return (
      state.nineLives.households.items.find((household) =>
        household.members.includes(user.uid),
      ) ?? null
    );
  });

  useNineLivesSync(currentHousehold?.id ?? null, user?.uid ?? null);

  const defaultHouseholdName = useMemo(
    () => (user?.displayName ? `${user.displayName}'s household` : 'My household'),
    [user?.displayName],
  );

  const handleCreateHousehold = async (name: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createHousehold({ uid: user.uid, name })).unwrap();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Nine Lives.' />;
  }

  if (!currentHousehold) {
    return (
      <HouseholdSetupModal
        key={`${user.uid}-${defaultHouseholdName}`}
        isOpen
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onConfirm={handleCreateHousehold}
        onClose={() => undefined}
      />
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <header>
          <p className='text-muted-foreground text-sm uppercase tracking-[0.2em]'>
            Nine Lives
          </p>
          <h1 className='mt-2 text-3xl font-semibold'>{currentHousehold.name}</h1>
        </header>

        <div className='rounded-lg border border-border bg-card p-6'>
          <p className='text-muted-foreground text-sm'>Household members</p>
          <p className='mt-2 text-lg font-medium'>
            {currentHousehold.members.length} member(s)
          </p>
        </div>
      </div>
    </div>
  );
}

export default NineLives;
