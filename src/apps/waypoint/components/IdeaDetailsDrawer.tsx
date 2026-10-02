import { Badge, Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays } from 'lucide-react';

import { useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayLabel } from '@/utils/dateRangeUtils';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';

interface IdeaDetailsDrawerProps {
  trip: TripSpace;
  ideaId: string | null;
  currentUserId: string;
  onClose: () => void;
}

function IdeaDetailsDrawer({ trip, ideaId, currentUserId, onClose }: IdeaDetailsDrawerProps) {
  const idea = useAppSelector(
    (state) => state.waypoint.ideas.items.find((item) => item.id === ideaId) ?? null,
  );
  const adderInfo = useUserInfo(idea?.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';

  if (!idea) {
    return null;
  }

  const tags = getIdeaTags(idea);
  const { days, blocks } = getIdeaTiming(trip, idea);
  const timingText = [
    days.map((day) => getDayLabel(trip.startDate, day)).join(', '),
    blocks.join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={idea.title}
      showCloseButton
      footer={
        <div className='flex flex-col gap-2'>
          {idea.linkUrl && (
            <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='lg' variant='secondary'>
              Visit site
            </Button>
          )}
        </div>
      }
    >
      <div className='space-y-4'>
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
        <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
      </div>
    </Drawer>
  );
}

export default IdeaDetailsDrawer;
