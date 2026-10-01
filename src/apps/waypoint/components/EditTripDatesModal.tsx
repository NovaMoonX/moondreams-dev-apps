import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';

import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  selectStays,
  selectTimelineEvents,
  selectTripExpenses,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface TripDatesFormData {
  startDate: string;
  endDate: string;
  shiftDates: boolean;
}

interface EditTripDatesModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const DAY_MS = 86_400_000;

const { custom } = FormFactories;

function EditTripDatesModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripDatesModalProps) {
  const initialData = useMemo<TripDatesFormData>(
    () => ({
      startDate: toDateInputValue(trip?.startDate),
      endDate: toDateInputValue(trip?.endDate),
      shiftDates: true,
    }),
    [trip?.startDate, trip?.endDate],
  );
  const [formData, setFormData] = useState<TripDatesFormData>(initialData);
  const [resetCount, setResetCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectTimelineEvents);
  const stays = useAppSelector(selectStays);
  const expenses = useAppSelector(selectTripExpenses);
  const checklistItems = useAppSelector((state) => state.waypoint.checklist.items);

  const { startDate, endDate } = formData;
  const shiftDates = formData.shiftDates ?? true;
  const isStartDateChanging = startDate !== initialData.startDate;
  const hasDatesChanged = isStartDateChanging || endDate !== initialData.endDate;
  const wouldRequireDataShift = isStartDateChanging || endDate < initialData.endDate;

  const hasDatedItems =
    events.length > 0 ||
    stays.length > 0 ||
    expenses.some((expense) => expense.dayIndex !== null) ||
    checklistItems.some((item) => item.completeByDayIndex !== null);
  const showShiftOption = hasDatedItems && wouldRequireDataShift;

  const checkItemsOutOfRange = () => {
    if (!trip) {
      return false;
    }

    const newStartDate = fromDateInputValue(startDate);
    const newEndDate = fromDateInputValue(endDate);
    if (newStartDate === undefined || newEndDate === undefined) {
      return false;
    }

    const deltaDays = Math.round((newStartDate - trip.startDate) / DAY_MS);
    const newDayCount = getDayCount(newStartDate, newEndDate);
    const isOutOfRange = (dayIndex: number) => dayIndex < 0 || dayIndex >= newDayCount;

    return shiftDates
      ? events.some((event) => isOutOfRange(event.endDayIndex)) ||
          expenses.some((expense) => expense.dayIndex !== null && isOutOfRange(expense.dayIndex)) ||
          checklistItems.some(
            (item) => item.completeByDayIndex !== null && isOutOfRange(item.completeByDayIndex),
          ) ||
          stays.some((stay) => {
            const shiftedCheckIn = stay.checkInAt + (newStartDate - trip.startDate);
            const shiftedCheckOut = stay.checkOutAt + (newStartDate - trip.startDate);
            return shiftedCheckIn < newStartDate || shiftedCheckOut > newEndDate + DAY_MS;
          })
      : events.some((event) => isOutOfRange(event.endDayIndex - deltaDays)) ||
          expenses.some(
            (expense) => expense.dayIndex !== null && isOutOfRange(expense.dayIndex - deltaDays),
          ) ||
          checklistItems.some(
            (item) =>
              item.completeByDayIndex !== null && isOutOfRange(item.completeByDayIndex - deltaDays),
          ) ||
          stays.some(
            (stay) => stay.checkInAt < newStartDate || stay.checkOutAt > newEndDate + DAY_MS,
          );
  };
  const wouldPlaceItemsOutOfRange = checkItemsOutOfRange();

  const fields = useMemo(
    () => [
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
      ...(showShiftOption
        ? [
            custom({
              name: 'shiftDates',
              label: 'Existing plans',
              renderComponent: (props) => (
                <div className='space-y-1 pl-1'>
                  <label className='flex items-center gap-2'>
                    <Checkbox
                      checked={props.value as boolean}
                      onCheckedChange={(checked) => props.onValueChange(Boolean(checked))}
                    />
                    Shift every event, stay, expense, and checklist date to match
                  </label>
                  <div className='pl-7'>
                    {shiftDates && isStartDateChanging && (
                      <p className='text-muted-foreground mb-3 text-sm'>
                        Moving the start date will shift every event, stay, expense, and checklist
                        due date on this trip by the same amount.
                      </p>
                    )}
                    {shiftDates && !isStartDateChanging && (
                      <p className='text-muted-foreground mb-3 text-sm'>
                        The start date isn&apos;t changing, so everything keeps its current day and
                        time.
                      </p>
                    )}
                    {!shiftDates && (
                      <p className='text-warning mb-3 text-sm'>
                        Events, expenses, and checklist items will keep their exact date and time —
                        only their day number will update to match the new dates. <b>Note: </b>This
                        can take longer to process than shifting everything together.
                      </p>
                    )}
                    {wouldPlaceItemsOutOfRange && (
                      <p className='text-destructive mb-3 text-sm'>
                        These dates are shorter than before — some events, stays, expenses, or
                        checklist items fall outside the new range and will lose their day.
                      </p>
                    )}
                  </div>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [showShiftOption, shiftDates, isStartDateChanging, wouldPlaceItemsOutOfRange],
  );

  if (!trip) {
    return null;
  }

  const isFormComplete =
    fromDateInputValue(startDate) !== undefined && fromDateInputValue(endDate) !== undefined;

  const handleReset = () => {
    setFormData(initialData);
    setResetCount((current) => current + 1);
  };

  const handleSubmit = async (data: TripDatesFormData) => {
    const newStartDate = fromDateInputValue(data.startDate);
    const newEndDate = fromDateInputValue(data.endDate);

    if (newStartDate === undefined || newEndDate === undefined) {
      setError('Enter both estimated trip dates.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title: trip.title,
        startDate: newStartDate,
        endDate: newEndDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: null,
        coverImageRemoved: false,
        defaultCurrency: trip.defaultCurrency,
        shiftDates: data.shiftDates ?? true,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the dates.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip dates'>
      <Form
        key={resetCount}
        id='waypoint-trip-dates'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as TripDatesFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as TripDatesFormData);
        }}
        submitButton={
          <div className='space-y-3'>
            {hasDatesChanged && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='text-muted-foreground hover:text-foreground'
                onClick={handleReset}
              >
                Go back to original dates
              </Button>
            )}
            <ModalFooterActions
              rightActions={
                <>
                  <Button type='button' variant='secondary' onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type='submit'
                    loading={isSubmitting}
                    disabled={isSubmitting || !isFormComplete}
                  >
                    {isSubmitting ? 'Saving…' : 'Save'}
                  </Button>
                </>
              }
            />
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default EditTripDatesModal;
