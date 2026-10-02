import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import DayTimeField from '@apps/waypoint/components/DayTimeField';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import { getDayCount } from '@/utils/dateRangeUtils';
import { compareDayTime, shiftRangeEnd } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { PlaceRef, PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import type { RentalFields } from '@apps/waypoint/store/actions/rentalActions';
import type { Rental, TripSpace } from '@apps/waypoint/types';

interface RentalFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  rental?: Rental;
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (rental: RentalFields) => Promise<void> | void;
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
  const [showReturnLocation, setShowReturnLocation] = useState(Boolean(rental?.returnAddress));
  const [showTimezoneField, setShowTimezoneField] = useState(false);
  const [showConfirmationCode, setShowConfirmationCode] = useState(
    Boolean(rental?.confirmationCode),
  );
  const [showVehicle, setShowVehicle] = useState(Boolean(rental?.vehicle));
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const updateDraft = (changes: Partial<RentalDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const updatePickup = (day: number, time: string) => {
    const end = shiftRangeEnd({
      start: { day: draft.pickupDay, time: draft.pickupTime },
      end: { day: draft.returnDay, time: draft.returnTime },
      nextStart: { day, time },
      max: day < dayCount ? { day: dayCount - 1, time: '23:59' } : undefined,
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
  const effectiveTimezone = draft.timezone || trip.timezone;

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
        notes: rental?.notes ?? null,
        linkUrl: draft.linkUrl,
        linkPreview: draft.linkPreview,
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this rental.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Car rental'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Rental company</Label>
          <Input
            value={draft.name}
            placeholder='Hertz'
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </div>
        {showVehicle ? (
          <div className='space-y-1.5'>
            <Label>Vehicle</Label>
            <Input
              value={draft.vehicle}
              placeholder='Toyota RAV4 or similar'
              onChange={(event) => updateDraft({ vehicle: event.target.value })}
            />
          </div>
        ) : (
          <Button type='button' variant='link' size='sm' onClick={() => setShowVehicle(true)}>
            + Add vehicle
          </Button>
        )}
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
        <DayTimeField
          trip={trip}
          label='Pickup'
          day={draft.pickupDay}
          time={draft.pickupTime}
          onChange={updatePickup}
        />
        {showReturnLocation ? (
          <PlaceAutocompleteInput
            label='Return location'
            placeholder='Same as pickup if left empty'
            value={draft.returnLocation.address}
            onChange={(address) =>
              updateDraft({ returnLocation: { ...draft.returnLocation, address, ...UNLINKED_PLACE } })
            }
            bias={placeBias}
            onSelect={(result) => updateDraft({ returnLocation: toLocationDraft(result) })}
          />
        ) : (
          <Button type='button' variant='link' size='sm' onClick={() => setShowReturnLocation(true)}>
            + Add a different return location
          </Button>
        )}
        <DayTimeField
          trip={trip}
          label='Return'
          day={draft.returnDay}
          time={draft.returnTime}
          onChange={(day, time) => updateDraft({ returnDay: day, returnTime: time })}
        />
        {effectiveTimezone ? (
          <div className='space-y-1.5'>
            <Label>Time zone</Label>
            <div className='flex flex-wrap items-center gap-2'>
              <TimezoneSelect
                pill
                value={effectiveTimezone}
                onChange={(value) => updateDraft({ timezone: value === trip.timezone ? '' : value })}
              />
              {draft.timezone === '' && (
                <span className='text-muted-foreground text-xs'>Trip default</span>
              )}
            </div>
          </div>
        ) : showTimezoneField ? (
          <div className='space-y-1.5'>
            <Label>Time zone</Label>
            <TimezoneSelect pill value={draft.timezone} onChange={(value) => updateDraft({ timezone: value })} />
          </div>
        ) : (
          <Button type='button' variant='link' size='sm' onClick={() => setShowTimezoneField(true)}>
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
          <Button type='button' variant='link' size='sm' onClick={() => setShowConfirmationCode(true)}>
            + Add confirmation code
          </Button>
        )}
        <LinkAttachField
          url={draft.linkUrl}
          preview={draft.linkPreview}
          label='Reservation link'
          addLabel='+ Add reservation link'
          placeholder='https://www.hertz.com/…'
          onChange={(linkUrl, linkPreview) => updateDraft({ linkUrl, linkPreview })}
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
    </Modal>
  );
}

export default RentalFormModal;
