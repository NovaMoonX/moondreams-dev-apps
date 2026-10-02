import { Badge } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ExternalLinkText from '@/components/ExternalLinkText';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  ACTIVITY_SETTING_LABELS,
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
  TIME_BLOCK_LABELS,
} from '@apps/waypoint/constants';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';

interface IdeaCardProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
}

function getDetailChips(trip: TripSpace, idea: TripIdea) {
  const { ideaDetails } = idea;
  if (!ideaDetails) {
    return [];
  }

  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const typeChips =
    'cuisines' in ideaDetails
      ? ideaDetails.cuisines
      : ideaDetails.settings.map((setting) => ACTIVITY_SETTING_LABELS[setting]);
  const dayChips = ideaDetails.suggestedDays
    .filter((day) => day >= 0 && day < dayCount)
    .map((day) => getDayLabel(trip.startDate, day));
  const timeChips = ideaDetails.suggestedTimeBlocks.map((block) => TIME_BLOCK_LABELS[block]);

  return [...typeChips, ...dayChips, ...timeChips];
}

function IdeaCard({ trip, idea, currentUserId }: IdeaCardProps) {
  const adderInfo = useUserInfo([idea.addedByUid])?.map[idea.addedByUid];
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const isOnItinerary = idea.convertedToEntityId !== null;
  const chips = getDetailChips(trip, idea);

  return (
    <div className='border-border bg-card space-y-2 rounded-xl border p-3'>
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
            <p className='text-muted-foreground text-xs'>Suggested by {adderName}</p>
          </div>
        </div>
        <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
      </div>
      {isOnItinerary && (
        <Badge variant='success' use='status'>
          On the itinerary
        </Badge>
      )}
      {idea.linkUrl && <ExternalLinkText href={idea.linkUrl} />}
      {chips.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {chips.map((chip) => (
            <Badge key={chip} variant='muted' outline>
              {chip}
            </Badge>
          ))}
        </div>
      )}
      {idea.notes && <p className='text-muted-foreground text-sm'>{idea.notes}</p>}
    </div>
  );
}

export default IdeaCard;
