import { useCallback, useMemo, useState } from 'react';

import { Button, Checkbox, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  selectStays,
  selectTimelineEvents,
  selectTripExpenses,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface EditTripDatesModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues) => Promise<void> | void;
  onClose: () => void;
}

const DAY_MS = 86_400_000;

function EditTripDatesModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripDatesModalProps) {
  const [startDate, setStartDate] = useState(toDateInputValue(trip?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(trip?.endDate));
  const [shiftDates, setShiftDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectTimelineEvents);
  const stays = useAppSelector(selectStays);
  const expenses = useAppSelector(selectTripExpenses);
  const checklistItems = useAppSelector((state) => state.waypoint.checklist.items);

  const initialStartDate = toDateInputValue(trip?.startDate);
  const initialEndDate = toDateInputValue(trip?.endDate);

  const wouldRequireDataShift = useMemo(() => {
    if (!trip) {
      return false;
    }
    return startDate !== initialStartDate || endDate < initialEndDate;
  }, [trip, startDate, endDate, initialStartDate, initialEndDate]);

  const hasDatedItems =
    events.length > 0 ||
    stays.length > 0 ||
    expenses.some((expense) => expense.dayIndex !== null) ||
    checklistItems.some((item) => item.completeByDayIndex !== null);

  const wouldPlaceItemsOutOfRange = useCallback(() => {
    if (!trip) {
      return false;
    }

    const newStartDate = fromDateInputValue(startDate);
    const newEndDate = fromDateInputValue(endDate);

    const deltaDays =
      newStartDate !== undefined ? Math.round((newStartDate - trip.startDate) / DAY_MS) : 0;
    const newDayCount =
      newStartDate !== undefined && newEndDate !== undefined
        ? getDayCount(newStartDate, newEndDate)
        : null;

    const isOutOfRange = (dayIndex: number) =>
      newDayCount === null || dayIndex < 0 || dayIndex >= newDayCount;

    if (newDayCount === null || newStartDate === undefined || newEndDate === undefined) {
      return false;
    }

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
  }, [events, stays, expenses, checklistItems, trip, startDate, endDate, shiftDates]);

  if (!trip) {
    return null;
  }

  const isStartDateChanging = startDate !== initialStartDate;
  const hasDatesChanged = startDate !== initialStartDate || endDate !== initialEndDate;

  const handleSubmit = async () => {
    const newStartDate = fromDateInputValue(startDate);
    const newEndDate = fromDateInputValue(endDate);

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
        shiftDates,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the dates.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip dates'>
      <div className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor={`trip-start-${trip.id}`}>Estimated start date</Label>
          <Input
            id={`trip-start-${trip.id}`}
            type='date'
            variant='outline'
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor={`trip-end-${trip.id}`}>Estimated end date</Label>
          <Input
            id={`trip-end-${trip.id}`}
            type='date'
            variant='outline'
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          {hasDatesChanged && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='text-muted-foreground hover:text-foreground'
              onClick={() => {
                setStartDate(initialStartDate);
                setEndDate(initialEndDate);
              }}
            >
              Go back to original dates
            </Button>
          )}
        </div>
        {hasDatedItems && wouldRequireDataShift && (
          <div className='space-y-1 pl-1'>
            <label className='flex items-center gap-2'>
              <Checkbox checked={shiftDates} onCheckedChange={(checked) => setShiftDates(Boolean(checked))} />
              Shift every event, stay, expense, and checklist date to match
            </label>
            <div className='space-2 pl-7'>
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
              {wouldPlaceItemsOutOfRange() && (
                <p className='text-destructive mb-3 text-sm'>
                  These dates are shorter than before — some events, stays, expenses, or
                  checklist items fall outside the new range and will lose their day.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
      <div className='mt-4 flex justify-end gap-2'>
        <Button type='button' variant='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button
          type='button'
          loading={isSubmitting}
          disabled={
            isSubmitting ||
            fromDateInputValue(startDate) === undefined ||
            fromDateInputValue(endDate) === undefined
          }
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

export default EditTripDatesModal;
