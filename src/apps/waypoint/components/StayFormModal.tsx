import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { Stay, TripSpace } from '@apps/waypoint/types';

type StayValues = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

interface StayFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  isSubmitting?: boolean;
  onSubmit: (stay: StayValues) => Promise<void> | void;
  onClose: () => void;
}

interface StayDraft {
  name: string;
  address: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  checkInTimezone: string;
}

function getInitialDraft(trip: TripSpace): StayDraft {
  return {
    name: '',
    address: '',
    checkInDate: toLocalDateInputValue(trip.startDate),
    checkInTime: '15:00',
    checkOutDate: toLocalDateInputValue(trip.endDate),
    checkOutTime: '11:00',
    checkInTimezone: '',
  };
}

export function StayFormModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: StayFormModalProps) {
  const [draft, setDraft] = useState(() => getInitialDraft(trip));
  const [error, setError] = useState<string | null>(null);
  const updateDraft = (changes: Partial<StayDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const handleSubmit = async () => {
    if (!draft.name.trim() || !draft.address.trim()) {
      setError('Enter a stay name and address.');
      return;
    }

    const checkInAt = fromLocalDateAndTimeInputValues(draft.checkInDate, draft.checkInTime);
    const checkOutAt = fromLocalDateAndTimeInputValues(draft.checkOutDate, draft.checkOutTime);
    if (checkInAt === undefined || checkOutAt === undefined || checkOutAt <= checkInAt) {
      setError('Choose valid check-in and check-out times.');
      return;
    }

    try {
      await onSubmit({
        name: draft.name,
        address: draft.address,
        latitude: null,
        longitude: null,
        checkInAt,
        checkOutAt,
        checkInTimezone: draft.checkInTimezone,
        plannedArrivalAt: checkInAt,
        plannedDepartureAt: checkOutAt,
        confirmationCode: null,
        notes: null,
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this stay.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Stay'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Stay name</Label>
          <Input
            value={draft.name}
            placeholder='Shibuya Sky Hotel'
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>Address</Label>
          <Input
            value={draft.address}
            placeholder='Address'
            onChange={(event) => updateDraft({ address: event.target.value })}
          />
        </div>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label>Check-in</Label>
            <Input
              type='datetime-local'
              value={`${draft.checkInDate}T${draft.checkInTime}`}
              onChange={(event) => {
                const [date, time] = event.target.value.split('T');
                updateDraft({ checkInDate: date ?? '', checkInTime: time ?? '' });
              }}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>Check-out</Label>
            <Input
              type='datetime-local'
              value={`${draft.checkOutDate}T${draft.checkOutTime}`}
              onChange={(event) => {
                const [date, time] = event.target.value.split('T');
                updateDraft({ checkOutDate: date ?? '', checkOutTime: time ?? '' });
              }}
            />
          </div>
        </div>
        <div className='space-y-1.5'>
          <Label>Timezone (optional)</Label>
          <Input
            value={draft.checkInTimezone}
            placeholder='America/Los_Angeles'
            onChange={(event) => updateDraft({ checkInTimezone: event.target.value })}
          />
        </div>
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button type='button' loading={isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? 'Saving…' : 'Add stay'}
          </Button>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default StayFormModal;
