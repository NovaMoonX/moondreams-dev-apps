import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import DetailSheet from '@/components/DetailSheet';

export interface PersonSheetAction {
  label: string;
  isDestructive: boolean;
  onClick: () => void;
}

interface PersonSheetProps {
  name: string;
  /** "Seller", "Co-seller" or "Waiting for them to sign in". */
  role: string;
  /** "Added Oct 28"; left out when the date is not known. */
  addedLabel: string | null;
  /** A message the seller can copy and send to a person who is only waiting; nothing is sent for them. */
  copyMessage?: string;
  action: PersonSheetAction | null;
  onClose: () => void;
}

/** One person on the sale: their name, role and when they were added, and the one thing the viewer can do about them. */
function PersonSheet({
  name,
  role,
  addedLabel,
  copyMessage,
  action,
  onClose,
}: PersonSheetProps) {
  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={name}
      footer={
        action && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              size='lg'
              rounded='full'
              variant={action.isDestructive ? 'destructive' : 'secondary'}
              className='flex-1'
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        )
      }
    >
      <p className='text-sm'>{role}</p>
      {addedLabel && (
        <p className='text-muted-foreground text-sm'>{addedLabel}</p>
      )}
      {copyMessage && (
        <CopyTextButton
          text={copyMessage}
          label='Copy a message to send'
          variant='secondary'
          className='mt-3'
        />
      )}
    </DetailSheet>
  );
}

export default PersonSheet;
