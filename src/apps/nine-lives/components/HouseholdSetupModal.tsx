import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useEffect, useState } from 'react';

interface HouseholdSetupModalProps {
  isOpen: boolean;
  defaultName: string;
  isSubmitting?: boolean;
  onConfirm: (name: string) => Promise<void> | void;
  onClose?: () => void;
}

function HouseholdSetupModal({
  isOpen,
  defaultName,
  isSubmitting = false,
  onConfirm,
  onClose,
}: HouseholdSetupModalProps) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName, isOpen]);

  const handleConfirm = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    await onConfirm(trimmedName);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title='Set up your household'
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          Create a household to keep your cats, visits, and records together.
        </p>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Luna's household"
          aria-label='Household name'
          name='nine-lives-household-name'
        />
        <Button
          onClick={handleConfirm}
          disabled={isSubmitting || !name.trim()}
          className='w-full'
        >
          {isSubmitting ? 'Creating…' : 'Create household'}
        </Button>
      </div>
    </Modal>
  );
}

export default HouseholdSetupModal;
