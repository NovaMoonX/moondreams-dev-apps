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
    () =>
      households.map((household) => ({
        text: household.name,
        value: household.id,
      })),
    [households],
  );

  const defaultHouseholdName = useMemo(
    () =>
      user?.displayName ? `${user.displayName}'s household` : 'My household',
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
    <header className='border-border bg-card flex flex-col gap-4 rounded-lg border p-6 md:flex-row md:items-end md:justify-between'>
      <div>
        <p className='text-muted-foreground text-sm tracking-[0.2em] uppercase'>
          Nine Lives
        </p>
        <h1 className='mt-2 text-3xl font-semibold'>
          {selectedHousehold?.name}
        </h1>
        <p className='text-muted-foreground mt-2 text-sm'>
          {selectedHousehold?.members.length ?? 0} member(s) in this household
        </p>
      </div>

      <div className='flex flex-col gap-2 items-center sm:items-end'>
        <Label className='text-muted-foreground'>Household</Label>
        <div className='flex flex-col items-center sm:items-end gap-3'>
          <div className='flex-1 max-w-full'>
            <Select
              options={householdOptions}
              value={selectedHousehold?.id ?? ''}
              onChange={(value) => onSelectHousehold(value || null)}
              placeholder='Select a household'
              searchable={householdOptions.length > 5}
            />
          </div>
          <Button
            type='button'
            variant='link'
            className='text-sm text-muted-foreground hover:text-foreground'
            onClick={() => setShowHouseholdModal(true)}
          >
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
