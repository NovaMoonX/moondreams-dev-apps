import { useState } from 'react';
import UploadAutofill from '@apps/waypoint/components/UploadAutofill';
import { stayToFields, type StayFields } from '@apps/waypoint/utils/bookingImport';

import {
  Button,
  Input,
  Label,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { Clock, Globe } from 'lucide-react';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getDayCount, getDayOptions } from '@/utils/dateRangeUtils';
import { compareDayTime, shiftRangeEnd } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_DAYS_OUTSIDE_TRIP,
  STAY_TYPE_EMOJIS,
  STAY_TYPES,
  STAY_TYPE_OPTION_LABELS,
} from '@apps/waypoint/constants';
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

interface DayTimeFieldProps {
  trip: TripSpace;
  label: string;
  day: number;
  time: string;
  onChange: (day: number, time: string) => void;
}

function DayTimeField({ trip, label, day, time, onChange }: DayTimeFieldProps) {
  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Select
          options={getDayOptions(trip.startDate, trip.endDate, day, MAX_DAYS_OUTSIDE_TRIP).map(({ value, label }) => ({ value, text: label }))}
          value={String(day)}
          onChange={(value) => onChange(Number(value), time)}
        />
        <Input
          type='time'
          aria-label={`${label} time`}
          value={time}
          onChange={(event) => onChange(day, event.target.value)}
        />
      </div>
    </div>
  );
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
  const isRelative = isRelativeTrip(trip);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const lastDayWithBuffer = dayCount + MAX_DAYS_OUTSIDE_TRIP - 1;
  const initiallyHasPlanned = Boolean(
    stay &&
      (draft.plannedArrivalDay !== draft.checkInDay ||
        draft.plannedArrivalTime !== draft.checkInTime ||
        draft.plannedDepartureDay !== draft.checkOutDay ||
        draft.plannedDepartureTime !== draft.checkOutTime ||
        draft.plannedArrivalDate !== draft.checkInDate ||
        draft.plannedDepartureDate !== draft.checkOutDate),
  );
  const [revealed, setRevealed] = useState<string[]>(() =>
    [
      ...(initiallyHasPlanned ? ['planned'] : []),
      ...(stay?.linkUrl || stay?.confirmationCode ? ['booking'] : []),
      ...(stay?.checkInTimezone ? ['timezone'] : []),
    ],
  );
  const applyUpload = (fields: StayFields) => {
    const uploaded = { ...fields, id: '', tripId: trip.id, createdBy: '', createdAt: 0, lastEditedAt: 0 } as Stay;
    const next = getInitialDraft(trip, uploaded);
    const readAddress = Boolean(fields.address);
    setDraft((current) => ({
      ...next,
      name: next.name || current.name,
      address: readAddress ? next.address : current.address || next.address,
      ...(readAddress
        ? {}
        : { latitude: current.latitude, longitude: current.longitude, place: current.place }),
      linkUrl: current.linkUrl,
      linkPreview: current.linkPreview,
    }));
    setRevealed((current) => (uploaded.confirmationCode && !current.includes('booking') ? [...current, 'booking'] : current));
  };
  const updateDraft = (changes: Partial<StayDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const reveal = (key: string) => setRevealed((current) => [...current, key]);
  const hide = (key: string, cleared: Partial<StayDraft> = {}) => {
    setRevealed((current) => current.filter((item) => item !== key));
    updateDraft(cleared);
  };

  // Without its own planned times, a stay is planned to arrive at check-in and leave at check-out.
  const resolved: StayDraft = revealed.includes('planned')
    ? draft
    : {
        ...draft,
        plannedArrivalDay: draft.checkInDay,
        plannedArrivalTime: draft.checkInTime,
        plannedDepartureDay: draft.checkOutDay,
        plannedDepartureTime: draft.checkOutTime,
        plannedArrivalDate: draft.checkInDate,
        plannedDepartureDate: draft.checkOutDate,
      };

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
      max: nextStart.day <= lastDayWithBuffer ? { day: lastDayWithBuffer, time: '23:59' } : undefined,
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
    const checkIn = { dayIndex: resolved.checkInDay, time: resolved.checkInTime };
    const checkOut = { dayIndex: resolved.checkOutDay, time: resolved.checkOutTime };
    const plannedArrival = { dayIndex: resolved.plannedArrivalDay, time: resolved.plannedArrivalTime };
    const plannedDeparture = { dayIndex: resolved.plannedDepartureDay, time: resolved.plannedDepartureTime };
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

  const draftCheckInAt = fromLocalDateAndTimeInputValues(resolved.checkInDate, resolved.checkInTime);
  const draftCheckOutAt = fromLocalDateAndTimeInputValues(resolved.checkOutDate, resolved.checkOutTime);
  const draftPlannedArrivalAt = fromLocalDateAndTimeInputValues(
    resolved.plannedArrivalDate,
    resolved.plannedArrivalTime,
  );
  const draftPlannedDepartureAt = fromLocalDateAndTimeInputValues(
    resolved.plannedDepartureDate,
    resolved.plannedDepartureTime,
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

    const timeFields = isRelative
      ? relativeFields
      : draftCheckInAt !== undefined &&
          draftCheckOutAt !== undefined &&
          draftCheckOutAt > draftCheckInAt &&
          draftPlannedArrivalAt !== undefined &&
          draftPlannedDepartureAt !== undefined &&
          draftPlannedDepartureAt > draftPlannedArrivalAt
        ? {
            checkInAt: draftCheckInAt,
            checkOutAt: draftCheckOutAt,
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
        checkInTimezone: revealed.includes('timezone') ? draft.checkInTimezone : '',
        confirmationCode: revealed.includes('booking') ? draft.confirmationCode : '',
        notes: stay?.notes ?? null,
        place: draft.place,
        linkUrl: revealed.includes('booking') ? draft.linkUrl : '',
        linkPreview: revealed.includes('booking') ? draft.linkPreview : null,
        changeHistory: stay?.changeHistory ?? [],
        seenBy: stay?.seenBy ?? {},
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this stay.'));
    }
  };

  const chips = [
    ...(isRelative ? [{ key: 'timezone', label: 'Time zone', icon: <Globe className='h-4 w-4' /> }] : []),
    { key: 'planned', label: 'Planned arrival', icon: <Clock className='h-4 w-4' /> },
  ].filter((chip) => !revealed.includes(chip.key));

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title='Stay'>
      <div className='space-y-5'>
        {!stay && isRelative && (
          <UploadAutofill
            kind='stay'
            trip={trip}
            noun='booking confirmation'
            convert={(extracted) => stayToFields(trip, extracted)}
            onFilled={({ value }) => applyUpload(value)}
          />
        )}
        <PillGroup
          label='Stay type'
          options={STAY_TYPES.map((stayType) => ({
            value: stayType,
            label: STAY_TYPE_OPTION_LABELS[stayType],
            emoji: STAY_TYPE_EMOJIS[stayType],
          }))}
          value={draft.stayType}
          onChange={(stayType) => updateDraft({ stayType })}
        />
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

        <SectionDivider label='When' />
        {isRelative ? (
          <div className='space-y-4'>
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
              onChange={(day, time) => updateDraft({ checkOutDay: day, checkOutTime: time })}
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
                  updateDraft({ checkOutDate: date ?? '', checkOutTime: time ?? '' });
                }}
              />
            </div>
          </div>
        )}
        <SectionDivider label='Booking' />
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>🔖 Already booked?</Label>
            <PillGroup
              label='Already booked'
              options={[
                { value: 'yes', label: 'Yes, I have the details' },
                { value: 'no', label: 'Not yet' },
              ]}
              value={revealed.includes('booking') ? 'yes' : 'no'}
              onChange={(value) => (value === 'yes' ? reveal('booking') : hide('booking'))}
            />
          </div>
          {revealed.includes('booking') && (
            <>
              <div className='space-y-1.5'>
                <Label>Confirmation code</Label>
                <Input
                  value={draft.confirmationCode}
                  placeholder='XK7P2Q'
                  onChange={(event) => updateDraft({ confirmationCode: event.target.value })}
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
            </>
          )}
        </div>
        {revealed.includes('planned') &&
          (isRelative ? (
            <RemovableField
              label='Planned arrival and departure'
              removeLabel='Remove planned times'
              onRemove={() => hide('planned')}
            >
              <div className='space-y-4'>
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
            </RemovableField>
          ) : (
            <RemovableField
              label='Planned arrival and departure'
              removeLabel='Remove planned times'
              onRemove={() => hide('planned')}
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <Input
                  type='datetime-local'
                  aria-label='Planned arrival'
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
                <Input
                  type='datetime-local'
                  aria-label='Planned departure'
                  value={`${draft.plannedDepartureDate}T${draft.plannedDepartureTime}`}
                  onChange={(event) => {
                    const [date, time] = event.target.value.split('T');
                    updateDraft({ plannedDepartureDate: date ?? '', plannedDepartureTime: time ?? '' });
                  }}
                />
              </div>
            </RemovableField>
          ))}
        {isRelative && revealed.includes('timezone') && effectiveTimezone && (
          <RemovableField
            label='Time zone'
            removeLabel='Remove time zone'
            onRemove={() => hide('timezone', { checkInTimezone: '' })}
          >
            <TimezoneSelect
              pill
              value={effectiveTimezone}
              onChange={(value) => updateDraft({ checkInTimezone: value === trip.timezone ? '' : value })}
            />
          </RemovableField>
        )}
        {!isRelative && revealed.includes('timezone') && (
          <RemovableField
            label='Time zone'
            removeLabel='Remove time zone'
            onRemove={() => hide('timezone', { checkInTimezone: '' })}
          >
            <TimezoneSelect
              pill
              value={draft.checkInTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(value) => updateDraft({ checkInTimezone: value })}
            />
          </RemovableField>
        )}
        <AddFieldChips heading='Add to this stay' chips={chips} onAdd={reveal} />
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          leftActions={
            stay &&
            onDelete && (
              <DeleteIconButton onClick={() => void onDelete()} disabled={isSubmitting} />
            )
          }
          cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
          }
          rightActions={
            <Button
                type='button'
                loading={isSubmitting}
                disabled={isSubmitting || !isFormComplete}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Saving…' : stay ? 'Save' : 'Add'}
              </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default StayFormModal;
