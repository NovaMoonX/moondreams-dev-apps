import { useState, type ReactElement } from 'react';

import { Badge, Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayLabel } from '@/utils/dateRangeUtils';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';
import { getOpenDetailsProps } from '@apps/waypoint/utils/openDetailsProps';

export type IdeaOpenProps = ReturnType<typeof getOpenDetailsProps>;

interface IdeaDetailsOverlayProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
  /** The tappable element; it receives the props that open the details. */
  renderTrigger: (openProps: IdeaOpenProps) => ReactElement;
}

function IdeaDetailsBody({
  trip,
  idea,
  currentUserId,
  isDrawer,
}: Omit<IdeaDetailsOverlayProps, 'renderTrigger'> & { isDrawer: boolean }) {
  const adderInfo = useUserInfo(idea.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const tags = getIdeaTags(idea);
  const { days, blocks } = getIdeaTiming(trip, idea);
  const timingText = [days.map((day) => getDayLabel(trip.startDate, day)).join(', '), blocks.join(' / ')]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='space-y-4'>
      {!isDrawer && <h3 className='font-semibold'>{idea.title}</h3>}
      <div className='flex flex-wrap items-center gap-2'>
        <span
          className={join(
            'flex h-7 w-7 items-center justify-center rounded-full text-sm',
            IDEA_TYPE_CHIP_CLASSES[idea.ideaType],
          )}
        >
          {IDEA_TYPE_EMOJIS[idea.ideaType]}
        </span>
        <span className='text-sm font-medium'>{IDEA_TYPE_LABELS[idea.ideaType]}</span>
        {idea.convertedToEntityId !== null && (
          <Badge variant='success' use='status'>
            On the itinerary
          </Badge>
        )}
      </div>
      <p className='text-muted-foreground text-sm'>Suggested by {adderName}</p>
      {timingText && (
        <p className='flex items-center gap-2 text-sm font-medium'>
          <CalendarDays className='text-primary h-4 w-4 shrink-0' />
          {timingText}
        </p>
      )}
      {tags.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {tags.map((tag) => (
            <Badge key={tag} variant='muted' outline>
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {idea.notes && <p className='text-sm'>{idea.notes}</p>}
      {isDrawer ? (
        <div className='flex justify-center pt-2'>
          <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} isProminent />
        </div>
      ) : (
        <div className='flex items-center justify-between gap-2'>
          <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
          {idea.linkUrl && (
            <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='sm' variant='secondary'>
              Visit site
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Phones get a bottom drawer with a big centered vote; wider screens a popover anchored to the idea. */
function IdeaDetailsOverlay({ trip, idea, currentUserId, renderTrigger }: IdeaDetailsOverlayProps) {
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const [isOpen, setIsOpen] = useState(false);
  const trigger = renderTrigger(getOpenDetailsProps(idea.title, () => setIsOpen(true)));

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={idea.title}
          showCloseButton
          footer={
            idea.linkUrl ? (
              <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='lg' variant='secondary'>
                Visit site
              </Button>
            ) : undefined
          }
        >
          {isOpen && <IdeaDetailsBody trip={trip} idea={idea} currentUserId={currentUserId} isDrawer />}
        </Drawer>
      </>
    );
  }

  return (
    <div className='[&>div]:block'>
      <Popover
        trigger={trigger}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placement='bottom'
        alignment='start'
        className='w-80 p-4'
      >
        {isOpen && (
          <IdeaDetailsBody trip={trip} idea={idea} currentUserId={currentUserId} isDrawer={false} />
        )}
      </Popover>
    </div>
  );
}

export default IdeaDetailsOverlay;
