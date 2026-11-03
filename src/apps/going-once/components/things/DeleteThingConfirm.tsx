import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useSheetHistory } from '@/hooks/useBackHistory';
import type { Item } from '@apps/going-once/types';
import type { AskedCount } from '@apps/going-once/utils/listing';
import {
  getDeleteEffects,
  getItemName,
  isListable,
} from '@apps/going-once/utils/listing';

export type DeleteChoice = 'DELETE' | 'TAKE_OFF' | null;

export interface DeleteQuestion {
  item: Item;
  collectedCents: number;
  /** People who have asked about the thing. */
  asked: AskedCount;
  settle: (choice: DeleteChoice) => void;
}

interface DeleteThingConfirmProps {
  question: DeleteQuestion | null;
}

/** The delete confirm: what goes with the thing, with taking it off the list offered first for a thing that can be. */
function DeleteThingConfirm({ question }: DeleteThingConfirmProps) {
  const { dialogId, onDialogClose } = useSheetHistory(question !== null, () =>
    question?.settle(null),
  );
  if (question === null) return null;
  const { item, collectedCents, asked, settle } = question;
  const name = getItemName(item);
  const canTakeOff =
    item.status === 'PENDING' ||
    (item.status === 'AVAILABLE' && isListable(item));

  return (
    <Modal
      id={dialogId}
      isOpen
      onClose={onDialogClose}
      hideCloseButton
      title={`Delete ${name}?`}
    >
      <p className='text-muted-foreground'>
        {[
          ...getDeleteEffects(item, collectedCents, asked),
          "This can't be undone.",
        ].join(' ')}
      </p>
      <div className='mt-5 flex flex-col gap-2'>
        {canTakeOff && (
          <Button
            type='button'
            variant='outline'
            rounded='full'
            className='w-full'
            onClick={() => settle('TAKE_OFF')}
          >
            Take it off the list instead
          </Button>
        )}
        <Button
          type='button'
          variant='destructive'
          rounded='full'
          className='w-full'
          onClick={() => settle('DELETE')}
        >
          Delete
        </Button>
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          className='w-full'
          onClick={() => settle(null)}
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

export default DeleteThingConfirm;
