import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import CreateOrJoinModal from '@/ui/CreateOrJoinModal';

interface HouseholdSetupModalProps {
  isOpen: boolean;
  defaultName: string;
  isSubmitting?: boolean;
  onCreate: (name: string) => Promise<void> | void;
  onJoin: (inviteCode: string) => Promise<void> | void;
  onClose?: () => void;
}

function HouseholdSetupModal({
  isOpen,
  defaultName,
  isSubmitting = false,
  onCreate,
  onJoin,
  onClose,
}: HouseholdSetupModalProps) {
  const [name, setName] = useState(defaultName);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setCreateError('Household name is required.');
      return;
    }

    setCreateError(null);

    try {
      await onCreate(trimmedName);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Unable to create your household.',
      );
    }
  };

  return (
    <CreateOrJoinModal
      isOpen={isOpen}
      onClose={onClose}
      isSubmitting={isSubmitting}
      noun='household'
      createDescription='Start a household for your cats, vets, and care records.'
      createContent={
        <>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Luna's household"
            aria-label='Household name'
            name='nine-lives-household-name'
          />
          {createError && <p className='text-destructive text-sm'>{createError}</p>}
          <Button
            onClick={handleCreate}
            disabled={isSubmitting || !name.trim()}
            className='w-full'
          >
            {isSubmitting ? 'Creating…' : 'Create household'}
          </Button>
        </>
      }
      joinDescription='Enter the code shared by someone already in the household.'
      inviteCodeLength={6}
      joinFieldName='nine-lives-household-invite-code'
      onJoin={onJoin}
    />
  );
}

export default HouseholdSetupModal;
