import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Lock } from 'lucide-react';

import { useSheetHistory } from '@/hooks/useBackHistory';

interface LockedButtonProps {
  label: string;
  /** The dialog's title, the lock stated plainly ("Creating trips is turned off"). */
  title: string;
  /** Why it is locked and what the person can still do. */
  children: ReactNode;
  className?: string;
}

/** A control the person is kept out of: visible, muted, with a lock; a tap (never a hover) opens a dialog that says why. Not natively `disabled`, which a phone gives no hover or tap. */
function LockedButton({ label, title, children, className }: LockedButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, () =>
    setIsOpen(false),
  );

  return (
    <>
      <Button
        aria-disabled
        className={join(className, 'opacity-60')}
        onClick={() => setIsOpen(true)}
      >
        <Lock className='h-4 w-4' aria-hidden />
        {label}
      </Button>
      <Modal id={dialogId} isOpen={isOpen} onClose={onDialogClose} title={title}>
        <div className='space-y-4'>
          <div className='text-muted-foreground space-y-2 text-sm'>{children}</div>
          <div className='flex justify-end'>
            <Button onClick={onDialogClose}>Got it</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default LockedButton;
