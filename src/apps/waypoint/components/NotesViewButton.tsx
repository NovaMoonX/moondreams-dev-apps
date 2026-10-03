import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

interface NotesViewButtonProps {
  title: string;
  notes: string | null;
}

export function NotesViewButton({ title, notes }: NotesViewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!notes) {
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
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        <p className='text-sm whitespace-pre-line'>{notes}</p>
      </Modal>
    </>
  );
}

export default NotesViewButton;
