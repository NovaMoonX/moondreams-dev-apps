import { useState } from 'react';

import { Button, Input, Label, Modal, Select } from '@moondreamsdev/dreamer-ui/components';

import { ADD_NEW_OPTION } from '@apps/waypoint/constants';
import { getStackKey, normalizeLabel } from '@apps/waypoint/utils/eventGroups';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { TimelineEvent } from '@apps/waypoint/types';

interface EventStackModalProps {
  isOpen: boolean;
  event: TimelineEvent;
  /** Every other event in the trip, to offer stacks of the same type and size the current one. */
  events: TimelineEvent[];
  isSubmitting?: boolean;
  /** Taking one trip out only makes sense from that trip's own card, not the stack header. */
  canRemoveTrip?: boolean;
  onStack: (stackName: string) => void;
  onRename: (stackName: string) => void;
  onRemove: () => void;
  onUnstackAll: () => void;
  onClose: () => void;
}

function EventStackModal({
  isOpen,
  event,
  events,
  isSubmitting = false,
  canRemoveTrip = true,
  onStack,
  onRename,
  onRemove,
  onUnstackAll,
  onClose,
}: EventStackModalProps) {
  const currentName = event.stackLabel ?? null;
  const sameTypeStacks = events
    .filter((other) => other.eventType === event.eventType && other.stackLabel && other.id !== event.id)
    .map((other) => other.stackLabel as string)
    .filter(
      (label, index, all) =>
        all.findIndex((candidate) => normalizeLabel(candidate) === normalizeLabel(label)) === index,
    );
  const [choice, setChoice] = useState(sameTypeStacks[0] ?? ADD_NEW_OPTION);
  const [name, setName] = useState(currentName ?? '');
  const isNewStack = choice === ADD_NEW_OPTION;
  const stackedCount = currentName
    ? events.filter((other) => getStackKey(other) === getStackKey(event)).length
    : 0;
  const trimmedName = name.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Stack'>
      {currentName ? (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Stacked with {stackedCount - 1} other event{stackedCount - 1 === 1 ? '' : 's'}.
          </p>
          <div className='space-y-1.5'>
            <Label>Stack name</Label>
            <Input value={name} onChange={(changeEvent) => setName(changeEvent.target.value)} />
          </div>
          <div className='flex flex-wrap gap-2'>
            {canRemoveTrip && (
              <Button type='button' variant='secondary' size='sm' disabled={isSubmitting} onClick={onRemove}>
                Take this trip out
              </Button>
            )}
            <Button type='button' variant='tertiary' size='sm' disabled={isSubmitting} onClick={onUnstackAll}>
              Unstack all
            </Button>
          </div>
          <ModalFooterActions
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='button'
                  disabled={isSubmitting || !trimmedName || trimmedName === currentName}
                  onClick={() => onRename(trimmedName)}
                >
                  Rename
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Stack the trips of everyone heading to the same place, so the whole itinerary sits together and each person can flip to their own.
          </p>
          {sameTypeStacks.length > 0 && (
            <div className='space-y-1.5'>
              <Label>Add to</Label>
              <Select
                options={[
                  ...sameTypeStacks.map((stack) => ({ value: stack, text: stack })),
                  { value: ADD_NEW_OPTION, text: 'New stack…' },
                ]}
                value={choice}
                onChange={setChoice}
              />
            </div>
          )}
          {isNewStack && (
            <div className='space-y-1.5'>
              <Label>Stack name</Label>
              <Input
                placeholder='Flights to Lisbon'
                value={name}
                onChange={(changeEvent) => setName(changeEvent.target.value)}
              />
            </div>
          )}
          <ModalFooterActions
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='button'
                  disabled={isSubmitting || (isNewStack && !trimmedName)}
                  onClick={() => onStack(isNewStack ? trimmedName : choice)}
                >
                  Stack
                </Button>
              </>
            }
          />
        </div>
      )}
    </Modal>
  );
}

export default EventStackModal;
