import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import AppEntryFallback from '@/ui/AppEntryFallback';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CatsSection from './components/CatsSection';
import ClinicsSection from './components/ClinicsSection';
import HouseholdSetupModal from './components/HouseholdSetupModal';
import HouseholdSwitcher from './components/HouseholdSwitcher';
import StatsSummary from './components/StatsSummary';
import { useNineLivesSync } from './hooks/useNineLivesSync';
import { createHousehold } from './store/actions/householdsActions';
import { requestToJoinHousehold } from './store/actions/pendingRequestsActions';

function NineLives() {
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSetupModalDismissed, setIsSetupModalDismissed] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  const households = useAppSelector((state) => {
    if (!user?.uid) {
      return [];
    }

    return state.nineLives.households.items.filter((household) =>
      household.members.includes(user.uid),
    );
  });

  const selectedHousehold = useMemo(() => {
    if (households.length === 0) {
      return null;
    }

    if (!selectedHouseholdId) {
      return households[0];
    }

    return (
      households.find((household) => household.id === selectedHouseholdId) ?? households[0]
    );
  }, [households, selectedHouseholdId]);

  useNineLivesSync(selectedHousehold?.id ?? null, user?.uid ?? null);

  const defaultHouseholdName = useMemo(
    () => (user?.displayName ? `${user.displayName}'s household` : 'My household'),
    [user],
  );

  const handleCreateFirstHousehold = async (name: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdHousehold = await dispatch(
        createHousehold({ uid: user.uid, name }),
      ).unwrap();
      setSelectedHouseholdId(createdHousehold.id);
      setIsSetupModalDismissed(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinFirstHousehold = async (inviteCode: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        requestToJoinHousehold({ uid: user.uid, inviteCode }),
      ).unwrap();
      setIsSetupModalDismissed(false);
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSetupModal = () => {
    setSelectedHouseholdId(null);
    setIsSetupModalDismissed(true);
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Nine Lives.' />;
  }

  if (households.length === 0 && isSetupModalDismissed) {
    return (
      <AppEntryFallback
        appName='Nine Lives'
        onEnterApp={() => setIsSetupModalDismissed(false)}
        onBackHome={() => navigate('/')}
      />
    );
  }

  if (households.length === 0) {
    return (
      <HouseholdSetupModal
        key={`${user.uid}-${defaultHouseholdName}`}
        isOpen
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onCreate={handleCreateFirstHousehold}
        onJoin={handleJoinFirstHousehold}
        onClose={handleCloseSetupModal}
      />
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-6xl space-y-6 py-8'>
        <div className='pb-2'>
          <NavButton href='/' variant='link'>
            <ChevronLeft /> Back home
          </NavButton>
        </div>

        <HouseholdSwitcher
          households={households}
          selectedHousehold={selectedHousehold}
          onSelectHousehold={setSelectedHouseholdId}
          onHouseholdCreated={setSelectedHouseholdId}
        />

        <StatsSummary />

        {selectedHousehold && <CatsSection householdId={selectedHousehold.id} />}
        {selectedHousehold && <ClinicsSection householdId={selectedHousehold.id} />}
      </div>
    </div>
  );
}

export default NineLives;
