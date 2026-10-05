import { useState, type ReactNode } from 'react';

import { Button, Input, Label, Select } from '@moondreamsdev/dreamer-ui/components';
import { Car, Globe } from 'lucide-react';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormScreen from '@/components/FormScreen';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import { getDayCount, getDayOptions } from '@/utils/dateRangeUtils';
import { compareDayTime, shiftRangeEnd } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef, PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import type { RentalFormFields } from '@apps/waypoint/store/actions/rentalActions';
import type { Rental, TripSpace } from '@apps/waypoint/types';

interface RentalFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  rental?: Rental;
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (rental: RentalFormFields) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

interface LocationDraft {
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: PlaceRef | null;
}

interface RentalDraft {
  name: string;
  vehicle: string;
  pickup: LocationDraft;
  returnLocation: LocationDraft;
  pickupDay: number;
  pickupTime: string;
  returnDay: number;
  returnTime: string;
  timezone: string;
  confirmationCode: string;
  linkUrl: string;
  linkPreview: LinkPreview | null;
}

function hasInitialValue(key: OptionalField, rental?: Rental) {
  const initialValues: Record<OptionalField, unknown> = {
    vehicle: rental?.vehicle,
    returnLocation: rental?.returnAddress,
    timezone: rental?.timezone,
    confirmationCode: rental?.confirmationCode,
    link: rental?.linkUrl,
  };
  return Boolean(initialValues[key]);
}

const EMPTY_LOCATION: LocationDraft = { address: '', latitude: null, longitude: null, place: null };

const EMPTY_OPTIONAL_VALUES: Record<OptionalField, Partial<RentalDraft>> = {
  vehicle: { vehicle: '' },
  returnLocation: { returnLocation: EMPTY_LOCATION },
  timezone: { timezone: '' },
  confirmationCode: { confirmationCode: '' },
  link: { linkUrl: '', linkPreview: null },
};

function getInitialDraft(trip: TripSpace, rental?: Rental): RentalDraft {
  const lastDay = getDayCount(trip.startDate, trip.endDate) - 1;
  return {
    name: rental?.name ?? '',
    vehicle: rental?.vehicle ?? '',
    pickup: {
      address: rental?.pickupAddress ?? '',
      latitude: rental?.pickupLatitude ?? null,
      longitude: rental?.pickupLongitude ?? null,
      place: rental?.pickupPlace ?? null,
    },
    returnLocation: {
      address: rental?.returnAddress ?? '',
      latitude: rental?.returnLatitude ?? null,
      longitude: rental?.returnLongitude ?? null,
      place: rental?.returnPlace ?? null,
    },
    pickupDay: rental?.pickupDayIndex ?? 0,
    pickupTime: rental?.pickupTime ?? '10:00',
    returnDay: rental?.returnDayIndex ?? lastDay,
    returnTime: rental?.returnTime ?? (lastDay === 0 ? '18:00' : '10:00'),
    timezone: rental?.timezone ?? '',
    confirmationCode: rental?.confirmationCode ?? '',
    linkUrl: rental?.linkUrl ?? '',
    linkPreview: rental?.linkPreview ?? null,
  };
}

function toLocationDraft(result: PlaceSelectionResult): LocationDraft {
  return {
    address: result.address,
    latitude: result.latitude,
    longitude: result.longitude,
    place: result.place,
  };
}

type OptionalField = 'vehicle' | 'returnLocation' | 'timezone' | 'confirmationCode' | 'link';

const OPTIONAL_FIELD_CHIPS: { key: OptionalField; label: string; icon: ReactNode }[] = [
  { key: 'vehicle', label: 'Vehicle', icon: <Car className='h-4 w-4' /> },
  { key: 'timezone', label: 'Time zone', icon: <Globe className='h-4 w-4' /> },
];

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

export function RentalFormModal({
  isOpen,
  trip,
  rental,
  placeBias,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: RentalFormModalProps) {
  const [draft, setDraft] = useState(() => getInitialDraft(trip, rental));
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<OptionalField[]>(() =>
    OPTIONAL_FIELD_CHIPS.map(({ key }) => key).filter((key) => hasInitialValue(key, rental)),
  );
  const isBooked = revealed.includes('confirmationCode') || revealed.includes('link');
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const updateDraft = (changes: Partial<RentalDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const reveal = (key: string) => setRevealed((current) => [...current, key as OptionalField]);
  const remove = (key: OptionalField) => {
    setRevealed((current) => current.filter((field) => field !== key));
    updateDraft(EMPTY_OPTIONAL_VALUES[key]);
  };

  const updatePickup = (day: number, time: string) => {
    const end = shiftRangeEnd({
      start: { day: draft.pickupDay, time: draft.pickupTime },
      end: { day: draft.returnDay, time: draft.returnTime },
      nextStart: { day, time },
      max: day <= dayCount + MAX_DAYS_OUTSIDE_TRIP - 1 ? { day: dayCount + MAX_DAYS_OUTSIDE_TRIP - 1, time: '23:59' } : undefined,
    });
    updateDraft({ pickupDay: day, pickupTime: time, returnDay: end.day, returnTime: end.time });
  };

  const hasValidTimes =
    Boolean(draft.pickupTime) &&
    Boolean(draft.returnTime) &&
    compareDayTime(
      { day: draft.returnDay, time: draft.returnTime },
      { day: draft.pickupDay, time: draft.pickupTime },
    ) > 0;
  const isFormComplete =
    draft.name.trim() !== '' && draft.pickup.address.trim() !== '' && hasValidTimes;

  const handleSubmit = async () => {
    if (!isFormComplete) {
      setError('Enter the rental company, a pickup location, and a return after the pickup.');
      return;
    }

    const returnAddress = draft.returnLocation.address.trim();
    try {
      await onSubmit({
        rentalType: 'CAR',
        name: draft.name,
        vehicle: draft.vehicle,
        pickupAddress: draft.pickup.address,
        pickupLatitude: draft.pickup.latitude,
        pickupLongitude: draft.pickup.longitude,
        pickupPlace: draft.pickup.place,
        returnAddress: returnAddress || null,
        returnLatitude: draft.returnLocation.latitude,
        returnLongitude: draft.returnLocation.longitude,
        returnPlace: draft.returnLocation.place,
        pickupDayIndex: draft.pickupDay,
        pickupTime: draft.pickupTime,
        returnDayIndex: draft.returnDay,
        returnTime: draft.returnTime,
        timezone: draft.timezone,
        confirmationCode: draft.confirmationCode,
        linkUrl: draft.linkUrl,
        linkPreview: draft.linkPreview,
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this rental.'));
    }
  };

  return (
    <FormScreen isOpen={isOpen} onClose={onClose} title='Car rental'>
      <div className='space-y-5'>
        <div className='space-y-1.5'>
          <Label>Rental company</Label>
          <Input
            value={draft.name}
            placeholder='Hertz'
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </div>
        <PlaceAutocompleteInput
          label='Pickup location'
          placeholder='Seattle-Tacoma Airport rental car center'
          value={draft.pickup.address}
          onChange={(address) =>
            updateDraft({ pickup: { ...draft.pickup, address, ...UNLINKED_PLACE } })
          }
          bias={placeBias}
          onSelect={(result) =>
            updateDraft({
              pickup: toLocationDraft(result),
              name: draft.name.trim() ? draft.name : result.name,
            })
          }
        />
        <SectionDivider label='When' />
        <DayTimeField
          trip={trip}
          label='Pickup'
          day={draft.pickupDay}
          time={draft.pickupTime}
          onChange={updatePickup}
        />
        <DayTimeField
          trip={trip}
          label='Return'
          day={draft.returnDay}
          time={draft.returnTime}
          onChange={(day, time) => updateDraft({ returnDay: day, returnTime: time })}
        />
        {revealed.includes('vehicle') && (
          <RemovableField label='Vehicle' removeLabel='Remove vehicle' onRemove={() => remove('vehicle')}>
            <Input
              value={draft.vehicle}
              placeholder='Toyota RAV4 or similar'
              onChange={(event) => updateDraft({ vehicle: event.target.value })}
            />
          </RemovableField>
        )}
        {revealed.includes('timezone') && (
          <RemovableField label='Time zone' removeLabel='Remove time zone' onRemove={() => remove('timezone')}>
            <div className='flex flex-wrap items-center gap-2'>
              <TimezoneSelect
                pill
                value={draft.timezone || trip.timezone || ''}
                onChange={(value) => updateDraft({ timezone: value === trip.timezone ? '' : value })}
              />
              {draft.timezone === '' && trip.timezone && (
                <span className='text-muted-foreground text-xs'>Trip default</span>
              )}
            </div>
          </RemovableField>
        )}
        <SectionDivider label='Pickup and return' />
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>🚗 Returning it somewhere else?</Label>
            <PillGroup
              label='Return spot'
              options={[
                { value: 'same', label: 'Same place' },
                { value: 'other', label: 'Somewhere else' },
              ]}
              value={revealed.includes('returnLocation') ? 'other' : 'same'}
              onChange={(value) => (value === 'other' ? reveal('returnLocation') : remove('returnLocation'))}
            />
          </div>
          {revealed.includes('returnLocation') && (
            <PlaceAutocompleteInput
              label='Return spot'
              placeholder='Where it goes back'
              value={draft.returnLocation.address}
              onChange={(address) =>
                updateDraft({ returnLocation: { ...draft.returnLocation, address, ...UNLINKED_PLACE } })
              }
              bias={placeBias}
              onSelect={(result) => updateDraft({ returnLocation: toLocationDraft(result) })}
            />
          )}
        </div>
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
              value={isBooked ? 'yes' : 'no'}
              onChange={(value) => {
                if (value === 'yes') {
                  setRevealed((current) => [...current, 'confirmationCode', 'link']);
                  return;
                }
                remove('confirmationCode');
                remove('link');
              }}
            />
          </div>
          {isBooked && (
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
                label='Link'
                addLabel='+ Add a link'
                placeholder='https://www.hertz.com/…'
                onChange={(linkUrl, linkPreview) => updateDraft({ linkUrl, linkPreview })}
              />
            </>
          )}
        </div>
        <AddFieldChips
          heading='Add rental details'
          chips={OPTIONAL_FIELD_CHIPS.filter((chip) => !revealed.includes(chip.key))}
          onAdd={reveal}
        />
        <ModalFooterActions
          leftActions={
            rental &&
            onDelete && <DeleteIconButton onClick={() => void onDelete()} disabled={isSubmitting} />
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
                {isSubmitting ? 'Saving…' : rental ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </FormScreen>
  );
}

export default RentalFormModal;
