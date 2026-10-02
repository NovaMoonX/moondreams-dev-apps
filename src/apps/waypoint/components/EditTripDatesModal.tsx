import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import DateRangeField, {
  type DateRangeValue,
} from '@/components/forms/DateRangeField';
import TimezoneField from '@/components/forms/TimezoneField';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  selectStays,
  selectTimelineEvents,
  selectTripExpenses,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { getStayTime } from '@apps/waypoint/utils/tripTime';

interface TripDatesFormData {
  dates: DateRangeValue;
  timezone: string;
  keepOriginalDates: boolean;
}

interface EditTripDatesModalProps {
  isOpen: boolean;
  trip: TripSpace | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditTripValues, timezone: string) => Promise<void> | void;
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
      dates: {
        startDate: toDateInputValue(trip?.startDate),
        endDate: toDateInputValue(trip?.endDate),
      },
      timezone: trip?.timezone ?? '',
      keepOriginalDates: false,
    }),
    [trip?.startDate, trip?.endDate, trip?.timezone],
  );
  const [formData, setFormData] = useState<TripDatesFormData>(initialData);
  const [resetCount, setResetCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectTimelineEvents);
  const stays = useAppSelector(selectStays);
  const expenses = useAppSelector(selectTripExpenses);
  const checklistItems = useAppSelector(
    (state) => state.waypoint.checklist.items,
  );

  const { startDate, endDate } = formData.dates;
  const keepOriginalDates = formData.keepOriginalDates;
  const hasDatesChanged =
    startDate !== initialData.dates.startDate ||
    endDate !== initialData.dates.endDate ||
    formData.timezone !== initialData.timezone;

  const newStartDate = fromDateInputValue(startDate);
  const newEndDate = fromDateInputValue(endDate);
  const deltaDays =
    trip && newStartDate !== undefined
      ? Math.round((newStartDate - trip.startDate) / DAY_MS)
      : 0;

  const hasDatedItems =
    events.some((event) => event.dayIndex !== null) ||
    stays.length > 0 ||
    expenses.some((expense) => expense.dayIndex !== null) ||
    checklistItems.some((item) => item.completeByDayIndex !== null);
  const showKeepOriginalOption = hasDatedItems && deltaDays !== 0;
  const isRebasing = showKeepOriginalOption && keepOriginalDates;

  const countItemsOutOfRange = () => {
    if (!trip || newStartDate === undefined || newEndDate === undefined) {
      return 0;
    }

    const newDayCount = getDayCount(newStartDate, newEndDate);
    const shift = isRebasing ? deltaDays : 0;
    const isOutOfRange = (dayIndex: number | null) =>
      dayIndex !== null &&
      (dayIndex - shift < 0 || dayIndex - shift >= newDayCount);

    const outOfRangeEvents = events.filter(
      (event) =>
        isOutOfRange(event.dayIndex) || isOutOfRange(event.endDayIndex),
    );
    const outOfRangeStays = stays.filter((stay) => {
      const { checkIn, checkOut, plannedArrival, plannedDeparture } =
        getStayTime(trip, stay);
      return [checkIn, checkOut, plannedArrival, plannedDeparture].some(
        (point) => isOutOfRange(point.dayIndex),
      );
    });
    const outOfRangeExpenses = expenses.filter((expense) =>
      isOutOfRange(expense.dayIndex),
    );
    const outOfRangeChecklist = checklistItems.filter((item) =>
      isOutOfRange(item.completeByDayIndex),
    );

    const result =
      outOfRangeEvents.length +
      outOfRangeStays.length +
      outOfRangeExpenses.length +
      outOfRangeChecklist.length;
    return result;
  };
  const outOfRangeCount = countItemsOutOfRange();

  const fields = useMemo(
    () => [
      custom({
        name: 'dates',
        label: '',
        renderComponent: (props) => (
          <DateRangeField
            value={props.value as DateRangeValue}
            onChange={(value) => props.onValueChange(value)}
            disabled={isSubmitting}
          />
        ),
      }),
      custom({
        name: 'timezone',
        label: '',
        renderComponent: (props) => (
          <TimezoneField
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
            describe={(zone) => (
              <>
                Times default to <b className='font-medium'>{zone}</b>. Events
                and stays can use their own.
              </>
            )}
            disabled={isSubmitting}
          />
        ),
      }),
      ...(showKeepOriginalOption
        ? [
            custom({
              name: 'keepOriginalDates',
              label: 'Existing plans',
              renderComponent: (props) => (
                <div className='space-y-1 pl-1'>
                  <label className='flex items-center gap-2'>
                    <Checkbox
                      checked={props.value as boolean}
                      onCheckedChange={(checked) =>
                        props.onValueChange(Boolean(checked))
                      }
                    />
                    Keep events and stays on their original dates
                  </label>
                  <p className='text-muted-foreground pl-7 text-sm'>
                    {props.value
                      ? 'Everything stays on the same calendar days, and its day number updates to match.'
                      : 'Everything moves along with the trip.'}
                  </p>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [showKeepOriginalOption, isSubmitting],
  );

  if (!trip) {
    return null;
  }

  const isFormComplete = newStartDate !== undefined && newEndDate !== undefined;

  const handleReset = () => {
    setFormData(initialData);
    setResetCount((current) => current + 1);
  };

  const handleSubmit = async (data: TripDatesFormData) => {
    const nextStartDate = fromDateInputValue(data.dates.startDate);
    const nextEndDate = fromDateInputValue(data.dates.endDate);

    if (nextStartDate === undefined || nextEndDate === undefined) {
      setError('Enter both trip dates.');
      return;
    }

    setError(null);
    try {
      await onSubmit(
        {
          title: trip.title,
          startDate: nextStartDate,
          endDate: nextEndDate,
          coverImageUrl: trip.coverImageUrl,
          coverImageFile: null,
          coverImageRemoved: false,
          defaultCurrency: trip.defaultCurrency,
          keepOriginalDates: isRebasing && data.keepOriginalDates,
        },
        data.timezone,
      );
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
      {outOfRangeCount > 0 && (
        <p className='text-warning mt-3 text-sm'>
          {outOfRangeCount === 1
            ? '1 item falls'
            : `${outOfRangeCount} items fall`}{' '}
          outside the new dates and will show under Outside trip dates.
        </p>
      )}
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default EditTripDatesModal;
