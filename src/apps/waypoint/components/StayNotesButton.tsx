import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import type { Stay } from '@apps/waypoint/types';

interface StayNotesButtonProps {
  stay: Stay;
}

export function StayNotesButton({ stay }: StayNotesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!stay.notes) {
    return null;
  }

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-auto min-h-0 p-0! text-sm'
        onClick={() => setIsOpen(true)}
      >
        View notes
      </Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={stay.name}>
        <p className='text-sm whitespace-pre-line'>{stay.notes}</p>
      </Modal>
    </>
  );
}

export default StayNotesButton;
