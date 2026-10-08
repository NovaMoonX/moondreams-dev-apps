import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import LocationLink from '@apps/waypoint/components/LocationLink';
import NotPaidForBadge from '@apps/waypoint/components/NotPaidForBadge';
import { getRentalSubject } from '@apps/waypoint/utils/relatedSubjects';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import NotesField from '@apps/waypoint/components/NotesField';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import FallbackImage from '@/components/FallbackImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { RENTAL_TYPE_LABELS } from '@apps/waypoint/constants';
import type { Rental, TripSpace } from '@apps/waypoint/types';
import {
  formatRentalTimeRange,
  getRentalTimezoneLabel,
  type ZoneStyle,
} from '@apps/waypoint/utils/tripTime';

interface RentalCardProps {
  trip: TripSpace;
  rental: Rental;
  canEdit: boolean;
  /** `onSuccess`, when given, is the mobile details drawer's own close — call it only once
   * the edit actually completes, not just because the edit modal was opened. */
  onEdit: (rental: Rental, onSuccess?: () => void) => void;
  onSaveNotes: (rental: Rental, notes: string) => Promise<void>;
}

const RENTAL_NOTES_PLACEHOLDER = 'Insurance, extra drivers, fuel policy…';

function getPickupLocation(rental: Rental) {
  return {
    locationName: null,
    address: rental.pickupAddress,
    latitude: rental.pickupLatitude,
    longitude: rental.pickupLongitude,
  };
}

function getReturnLocation(rental: Rental) {
  return rental.returnAddress
    ? {
        locationName: null,
        address: rental.returnAddress,
        latitude: rental.returnLatitude,
        longitude: rental.returnLongitude,
      }
    : getPickupLocation(rental);
}

export interface RentalDetailLinesProps {
  trip: TripSpace;
  rental: Rental;
  showTitle: boolean;
  showExtras: boolean;
  /** Cards abbreviate the zone ("PDT"); the full details view spells it out. */
  zoneStyle?: ZoneStyle;
  canEdit: boolean;
  onSaveNotes: (rental: Rental, notes: string) => Promise<void>;
}

export function RentalDetailLines({
  trip,
  rental,
  showTitle,
  showExtras,
  zoneStyle = 'short',
  canEdit,
  onSaveNotes,
}: RentalDetailLinesProps) {
  const timezoneLabel = getRentalTimezoneLabel(trip, rental, zoneStyle);

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        {showTitle && <h3 className='font-semibold'>{rental.name}</h3>}
        <Badge variant='muted' outline>
          {RENTAL_TYPE_LABELS[rental.rentalType ?? 'CAR']}
        </Badge>
        {!showTitle && <NotPaidForBadge getSubject={() => getRentalSubject(rental)} isStatic />}
      </div>
      {rental.vehicle && <p className='text-sm'>{rental.vehicle}</p>}
      <div className='flex flex-col items-start gap-1'>
        <LocationLink
          {...getPickupLocation(rental)}
          label={rental.returnAddress ? `Pickup · ${rental.pickupAddress}` : rental.pickupAddress}
        />
        {rental.returnAddress && (
          <LocationLink {...getReturnLocation(rental)} label={`Return · ${rental.returnAddress}`} />
        )}
      </div>
      <p className='text-muted-foreground text-sm'>{formatRentalTimeRange(trip, rental)}</p>
      {timezoneLabel && <p className='text-muted-foreground text-xs'>{timezoneLabel}</p>}
      {rental.linkUrl && (
        <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <ExternalLinkText href={rental.linkUrl} />
        </div>
      )}
      {showExtras && rental.confirmationCode && (
        <p className='text-sm'>
          <span className='text-muted-foreground'>Confirmation · </span>
          <span className='font-medium'>{rental.confirmationCode}</span>
        </p>
      )}
      {showExtras && (
        <NotesField
          key={rental.id}
          notes={rental.notes}
          canEdit={canEdit}
          onSave={(notes) => onSaveNotes(rental, notes)}
          variant='link'
          placeholder={RENTAL_NOTES_PLACEHOLDER}
        />
      )}
    </>
  );
}

export function RentalCard({ trip, rental, canEdit, onEdit, onSaveNotes }: RentalCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const closeDrawer = () => setIsDrawerOpen(false);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const imageUrl = getDisplayImage({ place: rental.pickupPlace, linkPreview: rental.linkPreview });
  const drawerTriggerProps = isSmallScreen
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Open details for ${rental.name}`,
        onClick: () => setIsDrawerOpen(true),
        onKeyDown: (keyEvent: KeyboardEvent<HTMLElement>) => {
          if (keyEvent.target === keyEvent.currentTarget && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
            keyEvent.preventDefault();
            setIsDrawerOpen(true);
          }
        },
      }
    : {};

  return (
    <>
      <div>
      <article
        {...drawerTriggerProps}
        className={join(
          'border-border bg-card flex flex-col overflow-hidden rounded-lg border sm:flex-row',
          isSmallScreen && 'cursor-pointer',
        )}
      >
        {imageUrl && (
          <FallbackImage
            src={imageUrl}
            alt=''
            className='aspect-video w-full object-cover sm:aspect-auto sm:w-44 sm:shrink-0'
          />
        )}
        <div className='flex min-w-0 flex-1 flex-col'>
          <div className='flex min-w-0 items-start justify-between gap-3 p-4'>
            <div className='min-w-0 space-y-1'>
              <RentalDetailLines
                trip={trip}
                rental={rental}
                showTitle
                showExtras={false}
                canEdit={canEdit}
                onSaveNotes={onSaveNotes}
              />
            </div>
            {!isSmallScreen && (
              <div className='flex shrink-0 gap-2'>
                <MapNavigationButton {...getPickupLocation(rental)} />
                {canEdit && (
                  <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(rental)}>
                    Modify
                  </Button>
                )}
              </div>
            )}
          </div>
          {!isSmallScreen && (rental.notes || canEdit) && (
            <div className='-mt-2 px-4 pb-3'>
              <NotesField
                key={rental.id}
                notes={rental.notes}
                canEdit={canEdit}
                onSave={(notes) => onSaveNotes(rental, notes)}
                variant='subtle'
                placeholder={RENTAL_NOTES_PLACEHOLDER}
              />
            </div>
          )}
        </div>
        {!isSmallScreen && (
          <div className='flex justify-end px-4 pb-3'>
            <NotPaidForBadge getSubject={() => getRentalSubject(rental)} />
          </div>
        )}
      </article>
      {isSmallScreen && (
        <div className='flex justify-end pr-4'>
          <NotPaidForBadge variant='tab' getSubject={() => getRentalSubject(rental)} />
        </div>
      )}
      </div>
      {isSmallScreen && (
        <PlaceDetailsDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          title={rental.name}
          imageUrl={imageUrl}
          location={getPickupLocation(rental)}
          linkUrl={rental.linkUrl}
          onEdit={canEdit ? () => { closeDrawer(); onEdit(rental); } : null}
        >
          <RentalDetailLines
            trip={trip}
            rental={rental}
            zoneStyle='long'
            showTitle={false}
            showExtras
            canEdit={canEdit}
            onSaveNotes={onSaveNotes}
          />
        </PlaceDetailsDrawer>
      )}
    </>
  );
}

export default RentalCard;
