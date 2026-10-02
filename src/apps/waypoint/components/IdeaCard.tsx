import { Badge } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays } from 'lucide-react';

import { useUserInfo } from '@/hooks/useUserInfo';
import IdeaDetailsOverlay, { type IdeaOpenProps } from '@apps/waypoint/components/IdeaDetailsOverlay';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTimingSummary } from '@apps/waypoint/utils/ideaLabels';

interface IdeaCardProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
}

function IdeaCard({ trip, idea, currentUserId }: IdeaCardProps) {
  const adderInfo = useUserInfo(idea.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const timing = getIdeaTimingSummary(trip, idea);
  const tags = getIdeaTags(idea);

  const renderCard = (openProps: IdeaOpenProps) => (
    <div
      {...openProps}
      className='border-border bg-card hover:bg-muted/40 cursor-pointer space-y-2 rounded-xl border p-3'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <span
            className={join(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm',
              IDEA_TYPE_CHIP_CLASSES[idea.ideaType],
            )}
            title={IDEA_TYPE_LABELS[idea.ideaType]}
          >
            {IDEA_TYPE_EMOJIS[idea.ideaType]}
          </span>
          <div className='min-w-0'>
            <p className='font-medium'>{idea.title}</p>
            {timing && (
              <p className='mt-0.5 flex items-center gap-1.5 text-sm font-medium'>
                <CalendarDays className='text-primary h-3.5 w-3.5 shrink-0' />
                {timing}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>Suggested by {adderName}</p>
          </div>
        </div>
        <span onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
        </span>
      </div>
      {tags.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {tags.map((tag) => (
            <Badge key={tag} variant='muted' outline>
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <IdeaDetailsOverlay
      trip={trip}
      idea={idea}
      currentUserId={currentUserId}
      renderTrigger={renderCard}
    />
  );
}

export default IdeaCard;
