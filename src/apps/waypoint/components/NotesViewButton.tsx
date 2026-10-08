import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';

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
        className='h-auto min-h-0 shrink-0 p-0! text-sm whitespace-nowrap'
        onClick={() => setIsOpen(true)}
      >
        View notes
      </Button>
      <DetailSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        <p className='text-sm whitespace-pre-line'>{notes}</p>
      </DetailSheet>
    </>
  );
}

export default NotesViewButton;
