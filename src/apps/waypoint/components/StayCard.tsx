import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import StayNotesButton from '@apps/waypoint/components/StayNotesButton';
import EnrichedImage from '@/components/EnrichedImage';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatDateTime } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { STAY_TYPE_LABELS } from '@apps/waypoint/constants';
import type { Stay } from '@apps/waypoint/types';

interface StayCardProps {
  stay: Stay;
  canEdit: boolean;
  onEdit: (stay: Stay) => void;
}

function getStayLocation(stay: Stay) {
  const location = {
    locationName: stay.stayType === 'HOTEL' ? stay.name : null,
    address: stay.address,
    latitude: stay.latitude,
    longitude: stay.longitude,
  };
  return location;
}

interface StayDetailLinesProps {
  stay: Stay;
  showTitle: boolean;
  showExtras: boolean;
  showNotesButton: boolean;
}

function StayDetailLines({ stay, showTitle, showExtras, showNotesButton }: StayDetailLinesProps) {
  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        {showTitle && <h3 className='font-semibold'>{stay.name}</h3>}
        <Badge variant='muted' outline>
          {STAY_TYPE_LABELS[stay.stayType ?? 'OTHER']}
        </Badge>
      </div>
      <LocationLink {...getStayLocation(stay)} label={stay.address} />
      <p className='text-muted-foreground text-sm'>
        {formatDateTime(stay.checkInAt)} - {formatDateTime(stay.checkOutAt)}
      </p>
      {stay.checkInTimezone && (
        <p className='text-muted-foreground text-xs'>{formatTimezoneLabel(stay.checkInTimezone)}</p>
      )}
      {(stay.linkUrl || (showNotesButton && stay.notes)) && (
        <div
          className='flex flex-wrap items-center gap-x-4 gap-y-1'
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          {showNotesButton && <StayNotesButton stay={stay} />}
          {stay.linkUrl && <ExternalLinkText href={stay.linkUrl} />}
        </div>
      )}
      {showExtras && stay.confirmationCode && (
        <p className='text-sm'>
          <span className='text-muted-foreground'>Confirmation · </span>
          <span className='font-medium'>{stay.confirmationCode}</span>
        </p>
      )}
      {showExtras && stay.notes && <p className='text-sm whitespace-pre-line'>{stay.notes}</p>}
    </>
  );
}

export function StayCard({ stay, canEdit, onEdit }: StayCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const imageUrl = getDisplayImage(stay);
  const drawerTriggerProps = isSmallScreen
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Open details for ${stay.name}`,
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
      <article
        {...drawerTriggerProps}
        className={join(
          'border-border bg-card flex flex-col overflow-hidden rounded-lg border sm:flex-row',
          isSmallScreen && 'cursor-pointer',
        )}
      >
        {imageUrl && (
          <EnrichedImage
            src={imageUrl}
            alt=''
            className='aspect-video w-full object-cover sm:aspect-auto sm:w-44 sm:shrink-0'
          />
        )}
        <div className='flex min-w-0 flex-1 items-start justify-between gap-3 p-4'>
          <div className='min-w-0 space-y-1'>
            <StayDetailLines stay={stay} showTitle showExtras={false} showNotesButton={!isSmallScreen} />
          </div>
          {!isSmallScreen && (
            <div className='flex shrink-0 gap-2'>
              <MapNavigationButton {...getStayLocation(stay)} />
              {canEdit && (
                <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(stay)}>
                  Modify
                </Button>
              )}
            </div>
          )}
        </div>
      </article>
      {isSmallScreen && (
        <PlaceDetailsDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={stay.name}
          imageUrl={imageUrl}
          location={getStayLocation(stay)}
          linkUrl={stay.linkUrl}
          onEdit={canEdit ? () => onEdit(stay) : null}
        >
          <StayDetailLines stay={stay} showTitle={false} showExtras showNotesButton={false} />
        </PlaceDetailsDrawer>
      )}
    </>
  );
}

export default StayCard;
