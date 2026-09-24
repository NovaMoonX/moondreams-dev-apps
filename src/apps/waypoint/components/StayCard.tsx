import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import NotesField from '@apps/waypoint/components/NotesField';
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
  onSaveNotes: (stay: Stay, notes: string) => Promise<void>;
}

const STAY_NOTES_PLACEHOLDER = 'Gate code, host contact, parking instructions…';

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
  canEdit: boolean;
  onSaveNotes: (stay: Stay, notes: string) => Promise<void>;
}

function StayDetailLines({ stay, showTitle, showExtras, canEdit, onSaveNotes }: StayDetailLinesProps) {
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
      {stay.linkUrl && (
        <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <ExternalLinkText href={stay.linkUrl} />
        </div>
      )}
      {showExtras && stay.confirmationCode && (
        <p className='text-sm'>
          <span className='text-muted-foreground'>Confirmation · </span>
          <span className='font-medium'>{stay.confirmationCode}</span>
        </p>
      )}
      {showExtras && (
        <NotesField
          key={stay.id}
          notes={stay.notes}
          canEdit={canEdit}
          onSave={(notes) => onSaveNotes(stay, notes)}
          variant='link'
          placeholder={STAY_NOTES_PLACEHOLDER}
        />
      )}
    </>
  );
}

export function StayCard({ stay, canEdit, onEdit, onSaveNotes }: StayCardProps) {
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
            <StayDetailLines
              stay={stay}
              showTitle
              showExtras={false}
              canEdit={canEdit}
              onSaveNotes={onSaveNotes}
            />
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
        {!isSmallScreen && (stay.notes || canEdit) && (
          <div className='-mt-2 px-4 pb-3'>
            <NotesField
              key={stay.id}
              notes={stay.notes}
              canEdit={canEdit}
              onSave={(notes) => onSaveNotes(stay, notes)}
              variant='subtle'
              placeholder={STAY_NOTES_PLACEHOLDER}
            />
          </div>
        )}
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
          <StayDetailLines
            stay={stay}
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

export default StayCard;
