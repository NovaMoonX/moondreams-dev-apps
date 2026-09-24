import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { useAppSelector } from '@/store';

import {
  selectStays,
  selectTimelineEvents,
  selectTripExpenses,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';

interface EditTripFormData {
  title: string;
  startDate: string;
  endDate: string;
  coverImageFile: File | null;
}

interface EditTripModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

function EditTripModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditTripFormData | null>(null);
  const coverUpload = useImageUpload(trip?.coverImageUrl ?? null);
  const events = useAppSelector(selectTimelineEvents);
  const stays = useAppSelector(selectStays);
  const expenses = useAppSelector(selectTripExpenses);
  const checklistItems = useAppSelector((state) => state.waypoint.checklist.items);

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Trip title',
        placeholder: 'Tokyo Summer 2026',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'startDate',
        label: 'Estimated start date',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'endDate',
        label: 'Estimated end date',
        variant: 'outline',
      }),
      custom({
        name: 'coverImageFile',
        label: 'Cover photo',
        renderComponent: () => (
          <div className='space-y-2'>
            {coverUpload.previewUrl && (
              <img
                src={coverUpload.previewUrl}
                alt='Cover preview'
                className='h-40 w-full rounded-md object-cover'
              />
            )}
            <ImageUploadField
              previewUrl={coverUpload.previewUrl}
              error={coverUpload.error}
              disabled={isSubmitting}
              hideAvatar
              onSelect={(file) => {
                coverUpload.pick(file);
                setFormData((current) => ({
                  ...(current ?? initialData),
                  coverImageFile: file,
                }));
              }}
              onRemove={() => {
                coverUpload.clear();
                setFormData((current) => ({
                  ...(current ?? initialData),
                  coverImageFile: null,
                }));
              }}
            />
          </div>
        ),
      }),
    ],
    [coverUpload, isSubmitting],
  );

  if (!trip) {
    return null;
  }

  const initialData: EditTripFormData = {
    title: trip.title,
    startDate: toDateInputValue(trip.startDate),
    endDate: toDateInputValue(trip.endDate),
    coverImageFile: null,
  };
  const currentData = formData ?? initialData;
  const isFormComplete =
    currentData.title.trim() !== '' &&
    fromDateInputValue(currentData.startDate) !== undefined &&
    fromDateInputValue(currentData.endDate) !== undefined;

  const hasDatedItems =
    events.length > 0 ||
    stays.length > 0 ||
    expenses.length > 0 ||
    checklistItems.length > 0;
  const newStartDate = fromDateInputValue(currentData.startDate);
  const newEndDate = fromDateInputValue(currentData.endDate);
  const willShiftDates =
    hasDatedItems && newStartDate !== undefined && newStartDate !== trip.startDate;
  const newDayCount =
    newStartDate !== undefined && newEndDate !== undefined
      ? getDayCount(newStartDate, newEndDate)
      : null;
  const dateDelta = newStartDate !== undefined ? newStartDate - trip.startDate : 0;
  const willOrphanItems =
    newDayCount !== null &&
    newStartDate !== undefined &&
    newEndDate !== undefined &&
    (events.some((event) => event.endDayIndex >= newDayCount) ||
      expenses.some(
        (expense) => expense.dayIndex !== null && expense.dayIndex >= newDayCount,
      ) ||
      checklistItems.some(
        (item) =>
          item.completeByDayIndex !== null && item.completeByDayIndex >= newDayCount,
      ) ||
      stays.some((stay) => {
        const shiftedCheckIn = stay.checkInAt + dateDelta;
        const shiftedCheckOut = stay.checkOutAt + dateDelta;
        return shiftedCheckIn < newStartDate || shiftedCheckOut > newEndDate;
      }));

  const handleSubmit = async (data: EditTripFormData) => {
    const title = data.title.trim();
    const startDate = fromDateInputValue(data.startDate);
    const endDate = fromDateInputValue(data.endDate);

    if (!title || startDate === undefined || endDate === undefined) {
      setError('Enter a title and both estimated trip dates.');
      return;
    }

    setError(null);

    try {
      await onSubmit({
        title,
        startDate,
        endDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: coverUpload.file,
        coverImageRemoved: coverUpload.previewUrl === null && Boolean(trip.coverImageUrl),
        defaultCurrency: trip.defaultCurrency,
      });
    } catch (submitError) {
      setError(
        getStorageErrorMessage(
          submitError,
          getErrorMessage(submitError, 'Unable to update this trip.'),
        ),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip details'>
      {willShiftDates && (
        <p className='text-muted-foreground mb-3 text-sm'>
          Moving the start date will shift every event, stay, expense, and checklist due
          date on this trip by the same amount.
        </p>
      )}
      {willOrphanItems && (
        <p className='text-destructive mb-3 text-sm'>
          These dates are shorter than before — some events, stays, expenses, or
          checklist items fall outside the new range and will lose their day.
        </p>
      )}
      <Form
        key={trip.id}
        id='waypoint-edit-trip'
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as EditTripFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as EditTripFormData);
        }}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button
              type='submit'
              loading={isSubmitting}
              disabled={isSubmitting || !isFormComplete}
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default EditTripModal;
