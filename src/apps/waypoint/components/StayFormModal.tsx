import { useMemo, useState } from 'react';

import {
  Button,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { getTimezoneOptions } from '@/utils/timezoneUtils';
import type { Stay, TripSpace } from '@apps/waypoint/types';

type StayValues = Omit<
  Stay,
  'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
>;

interface StayFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  stay?: Stay;
  isSubmitting?: boolean;
  onSubmit: (stay: StayValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
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
  plannedArrivalDate: string;
  plannedArrivalTime: string;
  plannedDepartureDate: string;
  plannedDepartureTime: string;
}

function getInitialDraft(trip: TripSpace, stay?: Stay): StayDraft {
  return {
    name: stay?.name ?? '',
    address: stay?.address ?? '',
    checkInDate: toLocalDateInputValue(stay?.checkInAt ?? trip.startDate),
    checkInTime: stay ? new Date(stay.checkInAt).toTimeString().slice(0, 5) : '15:00',
    checkOutDate: toLocalDateInputValue(stay?.checkOutAt ?? trip.endDate),
    checkOutTime: stay ? new Date(stay.checkOutAt).toTimeString().slice(0, 5) : '11:00',
    checkInTimezone: stay?.checkInTimezone ?? '',
    plannedArrivalDate: toLocalDateInputValue(stay?.plannedArrivalAt ?? trip.startDate),
    plannedArrivalTime: stay ? new Date(stay.plannedArrivalAt).toTimeString().slice(0, 5) : '15:00',
    plannedDepartureDate: toLocalDateInputValue(stay?.plannedDepartureAt ?? trip.endDate),
    plannedDepartureTime: stay ? new Date(stay.plannedDepartureAt).toTimeString().slice(0, 5) : '11:00',
  };
}

export function StayFormModal({
  isOpen,
  trip,
  stay,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: StayFormModalProps) {
  const [draft, setDraft] = useState(() => getInitialDraft(trip, stay));
  const [error, setError] = useState<string | null>(null);
  const [showTimezoneField, setShowTimezoneField] = useState(false);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const updateDraft = (changes: Partial<StayDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const draftCheckInAt = fromLocalDateAndTimeInputValues(
    draft.checkInDate,
    draft.checkInTime,
  );
  const draftCheckOutAt = fromLocalDateAndTimeInputValues(
    draft.checkOutDate,
    draft.checkOutTime,
  );
  const draftPlannedArrivalAt = fromLocalDateAndTimeInputValues(
    draft.plannedArrivalDate,
    draft.plannedArrivalTime,
  );
  const draftPlannedDepartureAt = fromLocalDateAndTimeInputValues(
    draft.plannedDepartureDate,
    draft.plannedDepartureTime,
  );
  const isFormComplete =
    draft.name.trim() !== '' &&
    draft.address.trim() !== '' &&
    draftCheckInAt !== undefined &&
    draftCheckOutAt !== undefined &&
    draftCheckOutAt > draftCheckInAt &&
    draftPlannedArrivalAt !== undefined &&
    draftPlannedDepartureAt !== undefined &&
    draftPlannedDepartureAt > draftPlannedArrivalAt;

  const handleSubmit = async () => {
    if (!draft.name.trim() || !draft.address.trim()) {
      setError('Enter a stay name and address.');
      return;
    }

    const checkInAt = fromLocalDateAndTimeInputValues(
      draft.checkInDate,
      draft.checkInTime,
    );
    const checkOutAt = fromLocalDateAndTimeInputValues(
      draft.checkOutDate,
      draft.checkOutTime,
    );
    if (
      checkInAt === undefined ||
      checkOutAt === undefined ||
      checkOutAt <= checkInAt ||
      draftPlannedArrivalAt === undefined ||
      draftPlannedDepartureAt === undefined ||
      draftPlannedDepartureAt <= draftPlannedArrivalAt
    ) {
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
        plannedArrivalAt: draftPlannedArrivalAt,
        plannedDepartureAt: draftPlannedDepartureAt,
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
                updateDraft({
                  checkInDate: date ?? '',
                  checkInTime: time ?? '',
                });
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
                updateDraft({
                  checkOutDate: date ?? '',
                  checkOutTime: time ?? '',
                });
              }}
            />
          </div>
        </div>
        {showTimezoneField ? (
          <div className='space-y-1.5'>
            <Label>Timezone</Label>
            <Select
              options={timezoneOptions}
              value={draft.checkInTimezone}
              onChange={(value) => updateDraft({ checkInTimezone: value })}
            />
          </div>
        ) : (
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={() => setShowTimezoneField(true)}
          >
            + Add timezone
          </Button>
        )}
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label>Planned arrival</Label>
            <Input
              type='datetime-local'
              value={`${draft.plannedArrivalDate}T${draft.plannedArrivalTime}`}
              onChange={(event) => {
                const [date, time] = event.target.value.split('T');
                updateDraft({ plannedArrivalDate: date ?? '', plannedArrivalTime: time ?? '' });
              }}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>Planned departure</Label>
            <Input
              type='datetime-local'
              value={`${draft.plannedDepartureDate}T${draft.plannedDepartureTime}`}
              onChange={(event) => {
                const [date, time] = event.target.value.split('T');
                updateDraft({ plannedDepartureDate: date ?? '', plannedDepartureTime: time ?? '' });
              }}
            />
          </div>
        </div>
        <div className='flex justify-end gap-2'>
          {stay && onDelete && (
            <Button type='button' variant='destructive' onClick={() => void onDelete()}>
              Delete
            </Button>
          )}
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='button'
            loading={isSubmitting}
            disabled={isSubmitting || !isFormComplete}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Saving…' : stay ? 'Save changes' : 'Add stay'}
          </Button>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default StayFormModal;
