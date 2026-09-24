import { useCallback, useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Form,
  FormCustomFieldProps,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';

import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  selectStays,
  selectTimelineEvents,
  selectTripExpenses,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface EditTripFormData {
  title: string;
  startDate: string;
  endDate: string;
  coverImageFile: File | null;
  shiftDates: boolean;
}

interface EditTripModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;
const DAY_MS = 86_400_000;

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
  const checklistItems = useAppSelector(
    (state) => state.waypoint.checklist.items,
  );

  const initialData: EditTripFormData = useMemo(() => {
    return {
      title: trip?.title ?? '',
      startDate: toDateInputValue(trip?.startDate),
      endDate: toDateInputValue(trip?.endDate),
      coverImageFile: null,
      shiftDates: true,
    };
  }, [trip]);

  const currentData = useMemo(
    () => formData ?? initialData,
    [formData, initialData],
  );

  const wouldRequireDataShift = useMemo(() => {
    if (!trip || !formData) {
      return false;
    }

    if (formData.startDate !== initialData.startDate) {
      return true;
    }

    if (formData.endDate < initialData.endDate) {
      return true;
    }

    return false;
  }, [trip, formData, initialData]);

  const hasDatedItems =
    events.length > 0 ||
    stays.length > 0 ||
    expenses.some((expense) => expense.dayIndex !== null) ||
    checklistItems.some((item) => item.completeByDayIndex !== null);

  const wouldPlaceItemsOutOfRange = useCallback(() => {
    if (!trip) {
      return false;
    }

    const newStartDate = fromDateInputValue(currentData.startDate);
    const newEndDate = fromDateInputValue(currentData.endDate);

    const deltaDays =
      newStartDate !== undefined
        ? Math.round((newStartDate - trip.startDate) / DAY_MS)
        : 0;
    const newDayCount =
      newStartDate !== undefined && newEndDate !== undefined
        ? getDayCount(newStartDate, newEndDate)
        : null;

    const isOutOfRange = (dayIndex: number) =>
      newDayCount === null || dayIndex < 0 || dayIndex >= newDayCount;
    const willOrphanItems =
      newDayCount !== null &&
      newStartDate !== undefined &&
      newEndDate !== undefined &&
      (currentData.shiftDates
        ? events.some((event) => isOutOfRange(event.endDayIndex)) ||
          expenses.some(
            (expense) =>
              expense.dayIndex !== null && isOutOfRange(expense.dayIndex),
          ) ||
          checklistItems.some(
            (item) =>
              item.completeByDayIndex !== null &&
              isOutOfRange(item.completeByDayIndex),
          ) ||
          stays.some((stay) => {
            const shiftedCheckIn =
              stay.checkInAt + (newStartDate - trip.startDate);
            const shiftedCheckOut =
              stay.checkOutAt + (newStartDate - trip.startDate);
            return (
              shiftedCheckIn < newStartDate ||
              shiftedCheckOut > newEndDate + DAY_MS
            );
          })
        : events.some((event) => isOutOfRange(event.endDayIndex - deltaDays)) ||
          expenses.some(
            (expense) =>
              expense.dayIndex !== null &&
              isOutOfRange(expense.dayIndex - deltaDays),
          ) ||
          checklistItems.some(
            (item) =>
              item.completeByDayIndex !== null &&
              isOutOfRange(item.completeByDayIndex - deltaDays),
          ) ||
          stays.some(
            (stay) =>
              stay.checkInAt < newStartDate ||
              stay.checkOutAt > newEndDate + DAY_MS,
          ));
    return willOrphanItems;
  }, [events, stays, expenses, checklistItems, trip, currentData]);

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
      ...(hasDatedItems && wouldRequireDataShift
        ? [
            custom({
              name: 'shiftDates',
              label: 'Dated items',
              renderComponent: ({
                value,
                onValueChange,
              }: FormCustomFieldProps) => {
                const checkedValue = Boolean(value);
                return (
                  <div className='space-y-1 pl-1'>
                    <label className='flex items-center gap-2'>
                      <Checkbox
                        checked={checkedValue}
                        onCheckedChange={(checked) => onValueChange(checked)}
                      />
                      Shift every event, stay, expense, and checklist date to
                      match
                    </label>

                    <div className='pl-7 space-2'>
                      {checkedValue && (
                        <p className='text-muted-foreground mb-3 text-sm'>
                          Moving the start date will shift every event, stay,
                          expense, and checklist due date on this trip by the
                          same amount.
                        </p>
                      )}
                      {!checkedValue && (
                        <p className='text-warning mb-3 text-sm'>
                          Events, expenses, and checklist items will keep their
                          exact date and time — only their day number will
                          update to match the new dates. <b>Note: </b>This can
                          take longer to process than shifting everything
                          together.
                        </p>
                      )}
                      {wouldPlaceItemsOutOfRange() && (
                        <p className='text-destructive mb-3 text-sm'>
                          These dates are shorter than before — some events,
                          stays, expenses, or checklist items fall outside the
                          new range and will lose their day.
                        </p>
                      )}
                    </div>
                  </div>
                );
              },
            }),
          ]
        : []),
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
    [
      coverUpload,
      isSubmitting,
      hasDatedItems,
      wouldRequireDataShift,
      initialData,
      wouldPlaceItemsOutOfRange,
    ],
  );

  if (!trip) {
    return null;
  }

  const isFormComplete =
    currentData.title.trim() !== '' &&
    fromDateInputValue(currentData.startDate) !== undefined &&
    fromDateInputValue(currentData.endDate) !== undefined;

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
        coverImageRemoved:
          coverUpload.previewUrl === null && Boolean(trip.coverImageUrl),
        defaultCurrency: trip.defaultCurrency,
        shiftDates: data.shiftDates,
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
