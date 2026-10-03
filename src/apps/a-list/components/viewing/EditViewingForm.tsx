import { useState } from 'react';

import { Button, Form } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import {
  createDateInputField,
  createTimeInputField,
} from '@/utils/formFactoryHelpers';
import type { Viewing } from '@apps/a-list/types';

interface ShowtimeValues {
  date: string;
  time: string;
}

const SHOWTIME_FIELDS = [
  createDateInputField({ name: 'date', label: 'Date', variant: 'outline' }),
  createTimeInputField({ name: 'time', label: 'Showtime', variant: 'outline' }),
];

interface EditViewingFormProps {
  viewing: Viewing;
  now: number;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (showtimeAt: number) => void;
}

function EditViewingForm({
  viewing,
  now,
  isSaving,
  onCancel,
  onSave,
}: EditViewingFormProps) {
  const [values, setValues] = useState<ShowtimeValues>({
    date: toLocalDateInputValue(viewing.showtimeAt),
    time: toLocalTimeInputValue(viewing.showtimeAt),
  });
  const showtimeAt = values.time
    ? fromLocalDateAndTimeInputValues(values.date, values.time)
    : undefined;
  // A seen movie can't be moved to a showing that hasn't started yet (the rules enforce it too).
  const isTooEarlyForSeen =
    viewing.status === 'SEEN' && showtimeAt !== undefined && showtimeAt > now;
  const hasChanged =
    showtimeAt !== undefined && showtimeAt !== viewing.showtimeAt;
  const canSave = hasChanged && !isTooEarlyForSeen;

  return (
    <div className='space-y-3'>
      <Form
        id='a-list-edit-viewing'
        form={SHOWTIME_FIELDS}
        initialData={values}
        columns={2}
        spacing='normal'
        onDataChange={(data) => setValues(data as ShowtimeValues)}
      />
      {isTooEarlyForSeen && (
        <p className='text-destructive text-sm'>
          You've already seen this one, so pick a time that has already started.
        </p>
      )}
      <ModalFooterActions
        rightActions={
          <>
            <Button
              type='button'
              variant='secondary'
              disabled={isSaving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type='button'
              loading={isSaving}
              disabled={!canSave || isSaving}
              onClick={() => showtimeAt !== undefined && onSave(showtimeAt)}
            >
              Save
            </Button>
          </>
        }
      />
    </div>
  );
}

export default EditViewingForm;
