import { useState } from 'react';

import {
  Button,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import DayTimeField from '@apps/waypoint/components/DayTimeField';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { compareDayTime, shiftRangeEnd } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { STAY_TYPES, STAY_TYPE_OPTION_LABELS } from '@apps/waypoint/constants';
import type { Stay, StayType, TripSpace } from '@apps/waypoint/types';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef } from '@/lib/places/types';
import type { PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import { buildStayTimeFields, getStayTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

type StayValues = Omit<
  Stay,
  'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
>;

interface StayFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  stay?: Stay;
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (stay: StayValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

interface StayDraft {
  name: string;
  stayType: StayType;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: PlaceRef | null;
  linkUrl: string;
  linkPreview: LinkPreview | null;
  confirmationCode: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  checkInTimezone: string;
  /** Trip day offsets for the check-in/check-out pickers on relative trips. */
  checkInDay: number;
  checkOutDay: number;
  plannedArrivalDay: number;
  plannedDepartureDay: number;
  plannedArrivalDate: string;
  plannedArrivalTime: string;
  plannedDepartureDate: string;
  plannedDepartureTime: string;
}

function getInitialDraft(trip: TripSpace, stay?: Stay): StayDraft {
  const relative = stay && isRelativeTrip(trip) ? getStayTime(trip, stay) : null;
  const lastDay = getDayCount(trip.startDate, trip.endDate) - 1;
  const isRelative = isRelativeTrip(trip);
  return {
    name: stay?.name ?? '',
    stayType: stay?.stayType ?? 'HOTEL',
    address: stay?.address ?? '',
    latitude: stay?.latitude ?? null,
    longitude: stay?.longitude ?? null,
    place: stay?.place ?? null,
    linkUrl: stay?.linkUrl ?? '',
    linkPreview: stay?.linkPreview ?? null,
    confirmationCode: stay?.confirmationCode ?? '',
    checkInDate: toLocalDateInputValue(stay?.checkInAt ?? trip.startDate),
    checkInTime: relative
      ? (relative.checkIn.time ?? '15:00')
      : stay?.checkInAt
        ? new Date(stay.checkInAt).toTimeString().slice(0, 5)
        : '15:00',
    checkOutDate: toLocalDateInputValue(stay?.checkOutAt ?? trip.endDate),
    checkOutTime: relative
      ? (relative.checkOut.time ?? '11:00')
      : stay?.checkOutAt
        ? new Date(stay.checkOutAt).toTimeString().slice(0, 5)
        : '11:00',
    checkInTimezone: stay?.checkInTimezone ?? '',
    checkInDay: relative ? (relative.checkIn.dayIndex ?? 0) : 0,
    checkOutDay: relative ? (relative.checkOut.dayIndex ?? lastDay) : isRelative ? lastDay : 0,
    plannedArrivalDay: relative ? (relative.plannedArrival.dayIndex ?? 0) : 0,
    plannedDepartureDay: relative ? (relative.plannedDeparture.dayIndex ?? lastDay) : isRelative ? lastDay : 0,
    plannedArrivalDate: toLocalDateInputValue(stay?.plannedArrivalAt ?? trip.startDate),
    plannedArrivalTime: relative
      ? (relative.plannedArrival.time ?? '15:00')
      : stay?.plannedArrivalAt
        ? new Date(stay.plannedArrivalAt).toTimeString().slice(0, 5)
        : '15:00',
    plannedDepartureDate: toLocalDateInputValue(stay?.plannedDepartureAt ?? trip.endDate),
    plannedDepartureTime: relative
      ? (relative.plannedDeparture.time ?? '11:00')
      : stay?.plannedDepartureAt
        ? new Date(stay.plannedDepartureAt).toTimeString().slice(0, 5)
        : '11:00',
  };
}

export function StayFormModal({
  isOpen,
  trip,
  stay,
  placeBias,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: StayFormModalProps) {
  const [draft, setDraft] = useState(() => getInitialDraft(trip, stay));
  const [error, setError] = useState<string | null>(null);
  const [showTimezoneField, setShowTimezoneField] = useState(false);
  const [showConfirmationCode, setShowConfirmationCode] = useState(
    Boolean(stay?.confirmationCode),
  );
  const isRelative = isRelativeTrip(trip);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const updateDraft = (changes: Partial<StayDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Moving a start instant keeps the same start->end window by shifting its paired end by
  // the same delta — used for both check-in/check-out and planned arrival/departure.
  const shiftPairedEnd = (
    oldStartDate: string,
    oldStartTime: string,
    oldEndDate: string,
    oldEndTime: string,
    newStartDate: string,
    newStartTime: string,
  ) => {
    const oldStartAt = fromLocalDateAndTimeInputValues(oldStartDate, oldStartTime);
    const oldEndAt = fromLocalDateAndTimeInputValues(oldEndDate, oldEndTime);
    const newStartAt = fromLocalDateAndTimeInputValues(newStartDate, newStartTime);
    if (oldStartAt === undefined || oldEndAt === undefined || newStartAt === undefined) {
      return null;
    }

    const newEndAt = newStartAt + (oldEndAt - oldStartAt);
    return { date: toLocalDateInputValue(newEndAt), time: toLocalTimeInputValue(newEndAt) };
  };

  // Moving a start carries its paired end along, keeping the length of the stay or plan.
  const shiftPair = (
    start: { day: number; time: string },
    end: { day: number; time: string },
    nextStart: { day: number; time: string },
  ) =>
    shiftRangeEnd({
      start,
      end,
      nextStart,
      max: nextStart.day < dayCount ? { day: dayCount - 1, time: '23:59' } : undefined,
    });

  const updateCheckIn = (day: number, time: string) => {
    const end = shiftPair(
      { day: draft.checkInDay, time: draft.checkInTime },
      { day: draft.checkOutDay, time: draft.checkOutTime },
      { day, time },
    );
    updateDraft({ checkInDay: day, checkInTime: time, checkOutDay: end.day, checkOutTime: end.time });
  };

  const updatePlannedArrival = (day: number, time: string) => {
    const end = shiftPair(
      { day: draft.plannedArrivalDay, time: draft.plannedArrivalTime },
      { day: draft.plannedDepartureDay, time: draft.plannedDepartureTime },
      { day, time },
    );
    updateDraft({
      plannedArrivalDay: day,
      plannedArrivalTime: time,
      plannedDepartureDay: end.day,
      plannedDepartureTime: end.time,
    });
  };

  const relativeTimeFields = () => {
    const checkIn = { dayIndex: draft.checkInDay, time: draft.checkInTime };
    const checkOut = { dayIndex: draft.checkOutDay, time: draft.checkOutTime };
    const plannedArrival = { dayIndex: draft.plannedArrivalDay, time: draft.plannedArrivalTime };
    const plannedDeparture = { dayIndex: draft.plannedDepartureDay, time: draft.plannedDepartureTime };
    const isOrdered = (start: typeof checkIn, end: typeof checkIn) =>
      Boolean(start.time) &&
      Boolean(end.time) &&
      compareDayTime(
        { day: end.dayIndex, time: end.time },
        { day: start.dayIndex, time: start.time },
      ) > 0;
    if (!isOrdered(checkIn, checkOut) || !isOrdered(plannedArrival, plannedDeparture)) {
      return null;
    }

    const result = buildStayTimeFields({ checkIn, checkOut, plannedArrival, plannedDeparture });
    return result;
  };
  const relativeFields = isRelative ? relativeTimeFields() : null;

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
  const hasValidTimes = isRelative
    ? relativeFields !== null
    : draftCheckInAt !== undefined &&
      draftCheckOutAt !== undefined &&
      draftCheckOutAt > draftCheckInAt &&
      draftPlannedArrivalAt !== undefined &&
      draftPlannedDepartureAt !== undefined &&
      draftPlannedDepartureAt > draftPlannedArrivalAt;
  const isFormComplete =
    draft.name.trim() !== '' && draft.address.trim() !== '' && hasValidTimes;
  const effectiveTimezone = draft.checkInTimezone || trip.timezone;

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
    const timeFields = isRelative
      ? relativeFields
      : checkInAt !== undefined &&
          checkOutAt !== undefined &&
          checkOutAt > checkInAt &&
          draftPlannedArrivalAt !== undefined &&
          draftPlannedDepartureAt !== undefined &&
          draftPlannedDepartureAt > draftPlannedArrivalAt
        ? {
            checkInAt,
            checkOutAt,
            plannedArrivalAt: draftPlannedArrivalAt,
            plannedDepartureAt: draftPlannedDepartureAt,
            checkInDayIndex: null,
            checkInTime: null,
            checkOutDayIndex: null,
            checkOutTime: null,
            plannedArrivalDayIndex: null,
            plannedArrivalTime: null,
            plannedDepartureDayIndex: null,
            plannedDepartureTime: null,
          }
        : null;
    if (!timeFields) {
      setError('Choose valid check-in and check-out times.');
      return;
    }

    try {
      await onSubmit({
        name: draft.name,
        stayType: draft.stayType,
        address: draft.address,
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...timeFields,
        checkInTimezone: draft.checkInTimezone,
        confirmationCode: draft.confirmationCode,
        notes: stay?.notes ?? null,
        place: draft.place,
        linkUrl: draft.linkUrl,
        linkPreview: draft.linkPreview,
        changeHistory: stay?.changeHistory ?? [],
        seenBy: stay?.seenBy ?? {},
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this stay.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Stay'>
      <div className='space-y-4'>
        <PlaceAutocompleteInput
          label='Stay name'
          placeholder='Shibuya Sky Hotel'
          value={draft.name}
          onChange={(name) => updateDraft({ name, ...UNLINKED_PLACE })}
          bias={placeBias}
          onSelect={(result: PlaceSelectionResult) =>
            updateDraft({
              name: result.name,
              address: result.address,
              latitude: result.latitude,
              longitude: result.longitude,
              place: result.place,
            })
          }
        />
        <div className='space-y-1.5'>
          <Label>Address</Label>
          <Input
            value={draft.address}
            placeholder='Address'
            onChange={(event) => updateDraft({ address: event.target.value, ...UNLINKED_PLACE })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>Stay type</Label>
          <Select
            options={STAY_TYPES.map((stayType) => ({
              value: stayType,
              text: STAY_TYPE_OPTION_LABELS[stayType],
            }))}
            value={draft.stayType}
            onChange={(value) => updateDraft({ stayType: value as StayType })}
          />
        </div>
        <LinkAttachField
          url={draft.linkUrl}
          preview={draft.linkPreview}
          label='Listing or website link'
          addLabel='+ Add listing or website link'
          placeholder='https://www.airbnb.com/rooms/… or the property website'
          onChange={(linkUrl, linkPreview) => updateDraft({ linkUrl, linkPreview })}
          currentTitle={draft.name}
          onUseTitle={(title) => updateDraft({ name: title })}
        />
        {isRelative ? (
          <div className='space-y-3'>
            <DayTimeField
              trip={trip}
              label='Check-in'
              day={draft.checkInDay}
              time={draft.checkInTime}
              onChange={updateCheckIn}
            />
            <DayTimeField
              trip={trip}
              label='Check-out'
              day={draft.checkOutDay}
              time={draft.checkOutTime}
              onChange={(day, time) =>
                updateDraft({ checkOutDay: day, checkOutTime: time })
              }
            />
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Check-in</Label>
              <Input
                type='datetime-local'
                value={`${draft.checkInDate}T${draft.checkInTime}`}
                onChange={(event) => {
                  const [date, time] = event.target.value.split('T');
                  const shiftedCheckOut = shiftPairedEnd(
                    draft.checkInDate,
                    draft.checkInTime,
                    draft.checkOutDate,
                    draft.checkOutTime,
                    date ?? '',
                    time ?? '',
                  );
                  updateDraft({
                    checkInDate: date ?? '',
                    checkInTime: time ?? '',
                    ...(shiftedCheckOut
                      ? { checkOutDate: shiftedCheckOut.date, checkOutTime: shiftedCheckOut.time }
                      : {}),
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
        )}
        {isRelative && effectiveTimezone ? (
          <div className='space-y-1.5'>
            <Label>Time zone</Label>
            <div className='flex flex-wrap items-center gap-2'>
              <TimezoneSelect
                pill
                value={effectiveTimezone}
                onChange={(value) =>
                  updateDraft({ checkInTimezone: value === trip.timezone ? '' : value })
                }
              />
              {draft.checkInTimezone === '' && (
                <span className='text-muted-foreground text-xs'>Trip default</span>
              )}
            </div>
          </div>
        ) : showTimezoneField ? (
          <div className='space-y-1.5'>
            <Label>Timezone</Label>
            <TimezoneSelect
              pill
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
        {showConfirmationCode ? (
          <div className='space-y-1.5'>
            <Label>Confirmation code</Label>
            <Input
              value={draft.confirmationCode}
              onChange={(event) => updateDraft({ confirmationCode: event.target.value })}
            />
          </div>
        ) : (
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={() => setShowConfirmationCode(true)}
          >
            + Add confirmation code
          </Button>
        )}
        {isRelative ? (
          <div className='space-y-3'>
            <DayTimeField
              trip={trip}
              label='Planned arrival'
              day={draft.plannedArrivalDay}
              time={draft.plannedArrivalTime}
              onChange={updatePlannedArrival}
            />
            <DayTimeField
              trip={trip}
              label='Planned departure'
              day={draft.plannedDepartureDay}
              time={draft.plannedDepartureTime}
              onChange={(day, time) =>
                updateDraft({ plannedDepartureDay: day, plannedDepartureTime: time })
              }
            />
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Planned arrival</Label>
              <Input
                type='datetime-local'
                value={`${draft.plannedArrivalDate}T${draft.plannedArrivalTime}`}
                onChange={(event) => {
                  const [date, time] = event.target.value.split('T');
                  const shiftedDeparture = shiftPairedEnd(
                    draft.plannedArrivalDate,
                    draft.plannedArrivalTime,
                    draft.plannedDepartureDate,
                    draft.plannedDepartureTime,
                    date ?? '',
                    time ?? '',
                  );
                  updateDraft({
                    plannedArrivalDate: date ?? '',
                    plannedArrivalTime: time ?? '',
                    ...(shiftedDeparture
                      ? {
                          plannedDepartureDate: shiftedDeparture.date,
                          plannedDepartureTime: shiftedDeparture.time,
                        }
                      : {}),
                  });
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
        )}
        <ModalFooterActions
          leftActions={
            stay &&
            onDelete && (
              <DeleteIconButton onClick={() => void onDelete()} disabled={isSubmitting} />
            )
          }
          rightActions={
            <>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button
                type='button'
                loading={isSubmitting}
                disabled={isSubmitting || !isFormComplete}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Saving…' : stay ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default StayFormModal;
