import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useSheetHistory } from '@/hooks/useBackHistory';

export type LeaveChoice = 'SAVE_DRAFT' | 'DISCARD' | null;

interface LeaveDraftConfirmProps {
  isOpen: boolean;
  /** `null` is Keep editing, and also Escape and the back gesture. */
  settle: (choice: LeaveChoice) => void;
}

/** What to do with a new thing that was written but not saved, asked once when the person leaves its walk-through. Three choices, which a two-button confirm can't hold. */
function LeaveDraftConfirm({ isOpen, settle }: LeaveDraftConfirmProps) {
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, () =>
    settle(null),
  );
  if (!isOpen) return null;

  return (
    <Modal
      id={dialogId}
      isOpen
      onClose={onDialogClose}
      hideCloseButton
      title='Save this as a draft?'
    >
      <p className='text-muted-foreground'>
        It keeps what you added so far. Buyers don&apos;t see it until you save
        it.
      </p>
      <div className='mt-5 flex flex-col gap-2'>
        <Button
          type='button'
          rounded='full'
          className='w-full'
          onClick={() => settle('SAVE_DRAFT')}
        >
          Save as draft
        </Button>
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          className='w-full'
          onClick={onDialogClose}
        >
          Keep editing
        </Button>
        <Button
          type='button'
          variant='tertiary'
          rounded='full'
          className='text-destructive! w-full'
          onClick={() => settle('DISCARD')}
        >
          Discard
        </Button>
      </div>
    </Modal>
  );
}

export default LeaveDraftConfirm;
