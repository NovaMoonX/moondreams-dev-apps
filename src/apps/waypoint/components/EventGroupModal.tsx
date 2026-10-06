import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import type { TimelineEvent } from '@apps/waypoint/types';

interface EventGroupModalProps {
  isOpen: boolean;
  event: TimelineEvent;
  legCount: number;
  isSubmitting?: boolean;
  onRename: (label: string) => void;
  onUngroup: () => void;
  onClose: () => void;
}

function EventGroupModal({
  isOpen,
  event,
  legCount,
  isSubmitting = false,
  onRename,
  onUngroup,
  onClose,
}: EventGroupModalProps) {
  const currentName = event.groupLabel ?? '';
  const [name, setName] = useState(currentName);
  const trimmedName = name.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Group'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {legCount} event{legCount === 1 ? '' : 's'} grouped together, like the legs of one trip.
        </p>
        <div className='space-y-1.5'>
          <Label>Group name</Label>
          <Input value={name} onChange={(changeEvent) => setName(changeEvent.target.value)} />
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='tertiary' size='sm' disabled={isSubmitting} onClick={onUngroup}>
            Ungroup
          </Button>
        </div>
        <ModalFooterActions
          cancelAction={
              <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
          }
          rightActions={
            <Button
                type='button'
                disabled={isSubmitting || !trimmedName || trimmedName === currentName}
                onClick={() => onRename(trimmedName)}
              >
                Rename
              </Button>
          }
        />
      </div>
    </Modal>
  );
}

export default EventGroupModal;
