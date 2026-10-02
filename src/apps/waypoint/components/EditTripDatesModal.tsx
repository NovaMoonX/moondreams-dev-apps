import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
  RadioGroup,
} from '@moondreamsdev/dreamer-ui/components';

import DateRangeField, {
  type DateRangeValue,
} from '@/components/forms/DateRangeField';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  selectRentals,
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
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectTimelineEvents);
  const stays = useAppSelector(selectStays);
  const rentals = useAppSelector(selectRentals);
  const expenses = useAppSelector(selectTripExpenses);
  const checklistItems = useAppSelector(
    (state) => state.waypoint.checklist.items,
  );

  const { startDate, endDate } = formData.dates;
  const keepOriginalDates = formData.keepOriginalDates;

  const newStartDate = fromDateInputValue(startDate);
  const newEndDate = fromDateInputValue(endDate);
  const deltaDays =
    trip && newStartDate !== undefined
      ? Math.round((newStartDate - trip.startDate) / DAY_MS)
      : 0;

  const hasDatedItems =
    events.some((event) => event.dayIndex !== null) ||
    stays.length > 0 ||
    rentals.length > 0 ||
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
    const outOfRangeRentals = rentals.filter(
      (rental) =>
        isOutOfRange(rental.pickupDayIndex) || isOutOfRange(rental.returnDayIndex),
    );
    const outOfRangeExpenses = expenses.filter((expense) =>
      isOutOfRange(expense.dayIndex),
    );
    const outOfRangeChecklist = checklistItems.filter((item) =>
      isOutOfRange(item.completeByDayIndex),
    );

    const result =
      outOfRangeEvents.length +
      outOfRangeStays.length +
      outOfRangeRentals.length +
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
      ...(showKeepOriginalOption || outOfRangeCount > 0
        ? [
            custom({
              name: 'keepOriginalDates',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-2'>
                  {showKeepOriginalOption && (
                    <RadioGroup
                      value={props.value ? 'keep' : 'move'}
                      onChange={(value) =>
                        props.onValueChange(value === 'keep')
                      }
                      options={[
                        { label: 'Move my plans with the trip', value: 'move' },
                        {
                          label: 'Keep my plans on their original dates',
                          value: 'keep',
                        },
                      ]}
                    />
                  )}
                  {outOfRangeCount > 0 && (
                    <p className='text-warning text-sm'>
                      {outOfRangeCount === 1
                        ? '1 item falls'
                        : `${outOfRangeCount} items fall`}{' '}
                      outside the new dates and will show under Outside trip
                      dates.
                    </p>
                  )}
                </div>
              ),
            }),
          ]
        : []),
      custom({
        name: 'timezone',
        label: '',
        renderComponent: (props) => (
          <TimezoneSelect
            pill
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
            disabled={isSubmitting}
          />
        ),
      }),
    ],
    [showKeepOriginalOption, outOfRangeCount, isSubmitting],
  );

  if (!trip) {
    return null;
  }

  const isFormComplete = newStartDate !== undefined && newEndDate !== undefined;

  const handleSubmit = async (data: TripDatesFormData) => {
    const nextStartDate = fromDateInputValue(data.dates.startDate);
    const nextEndDate = fromDateInputValue(data.dates.endDate);

    if (nextStartDate === undefined || nextEndDate === undefined) {
      setError('Enter both trip dates.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title: trip.title,
        startDate: nextStartDate,
        endDate: nextEndDate,
        coverImageUrl: trip.coverImageUrl,
        coverImageFile: null,
        coverImageRemoved: false,
        defaultCurrency: trip.defaultCurrency,
        timezone: data.timezone,
        keepOriginalDates: isRebasing && data.keepOriginalDates,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update the dates.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Trip dates'>
      <Form
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
            {error && <p className='text-destructive text-sm'>{error}</p>}
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
    </Modal>
  );
}

export default EditTripDatesModal;
