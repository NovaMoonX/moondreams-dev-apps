import type { ReactNode } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';

import EnrichedImage from '@/components/EnrichedImage';
import { getMapNavigationUrl, openMapNavigation } from '@/utils/mapUrlUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

interface PlaceDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageUrl: string | null;
  location: Pick<TimelineEvent, 'locationName' | 'address' | 'latitude' | 'longitude'>;
  linkUrl: string | null;
  onEdit: (() => void) | null;
  children: ReactNode;
}

export function PlaceDetailsDrawer({
  isOpen,
  onClose,
  title,
  imageUrl,
  location,
  linkUrl,
  onEdit,
  children,
}: PlaceDetailsDrawerProps) {
  const canNavigate = getMapNavigationUrl(location) !== null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={true}
      footer={
        <div className='flex flex-col gap-2'>
          {canNavigate && (
            <Button type='button' size='lg' onClick={() => openMapNavigation(location)}>
              Navigate
            </Button>
          )}
          {linkUrl && (
            <Button href={linkUrl} target='_blank' rel='noreferrer' size='lg' variant='secondary'>
              Visit site
            </Button>
          )}
          {onEdit && (
            <Button
              type='button'
              size='lg'
              variant='secondary'
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              Modify
            </Button>
          )}
        </div>
      }
    >
      <div className='space-y-4'>
        {imageUrl && (
          <EnrichedImage src={imageUrl} alt='' className='aspect-video w-full rounded-lg object-cover' />
        )}
        <div className='space-y-2'>{children}</div>
      </div>
    </Drawer>
  );
}

export default PlaceDetailsDrawer;
