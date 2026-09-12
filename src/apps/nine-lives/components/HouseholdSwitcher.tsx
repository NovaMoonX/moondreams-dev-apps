import { useMemo, useState } from 'react';

import { Button, Label, Select } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import HouseholdSetupModal from './HouseholdSetupModal';
import { createHousehold } from '../store/actions/householdsActions';
import type { Household } from '../types';

interface HouseholdSwitcherProps {
  households: Household[];
  selectedHousehold: Household | null;
  onSelectHousehold: (householdId: string | null) => void;
  onHouseholdCreated: (householdId: string) => void;
}

function HouseholdSwitcher({
  households,
  selectedHousehold,
  onSelectHousehold,
  onHouseholdCreated,
}: HouseholdSwitcherProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const householdOptions = useMemo(
    () => households.map((household) => ({ text: household.name, value: household.id })),
    [households],
  );

  const defaultHouseholdName = useMemo(
    () => (user?.displayName ? `${user.displayName}'s household` : 'My household'),
    [user],
  );

  const handleCreateHousehold = async (name: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdHousehold = await dispatch(
        createHousehold({ uid: user.uid, name }),
      ).unwrap();
      onHouseholdCreated(createdHousehold.id);
      setShowHouseholdModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <header className='flex flex-col gap-4 rounded-lg border border-border bg-card p-6 md:flex-row md:items-end md:justify-between'>
      <div>
        <p className='text-muted-foreground text-sm uppercase tracking-[0.2em]'>Nine Lives</p>
        <h1 className='mt-2 text-3xl font-semibold'>{selectedHousehold?.name}</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {selectedHousehold?.members.length ?? 0} member(s) in this household
        </p>
      </div>

      <div className='flex flex-col gap-2 md:items-end'>
        <Label className='text-muted-foreground'>Household</Label>
        <div className='flex gap-2'>
          <div className='min-w-52 flex-1'>
            <Select
              options={householdOptions}
              value={selectedHousehold?.id ?? ''}
              onChange={(value) => onSelectHousehold(value || null)}
              placeholder='Select a household'
              searchable
              clearable
            />
          </div>
          <Button type='button' variant='secondary' onClick={() => setShowHouseholdModal(true)}>
            Add household
          </Button>
        </div>
      </div>

      <HouseholdSetupModal
        key={`add-household-${user?.uid ?? 'anon'}`}
        isOpen={showHouseholdModal}
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onConfirm={handleCreateHousehold}
        onClose={() => setShowHouseholdModal(false)}
      />
    </header>
  );
}

export default HouseholdSwitcher;
