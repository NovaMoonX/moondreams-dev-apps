import { useMemo, useState } from 'react';

import { Button, Tabs, TabsList, TabsTrigger } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Lightbulb } from 'lucide-react';

import { useAppSelector } from '@/store';
import IdeaDetailsOverlay from '@apps/waypoint/components/IdeaDetailsOverlay';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import { IDEA_TYPE_EMOJIS, IDEA_TYPE_PLURAL_LABELS, IDEA_TYPES } from '@apps/waypoint/constants';
import { selectSortedIdeas } from '@apps/waypoint/store/selectors';
import type { IdeaType, TripSpace } from '@apps/waypoint/types';
import { getIdeaTimingSummary } from '@apps/waypoint/utils/ideaLabels';

interface IdeasOverviewProps {
  trip: TripSpace;
  currentUserId: string;
  canAdd: boolean;
  onOpen: () => void;
  onAdd: (ideaType: IdeaType) => void;
}

const PREVIEW_COUNT = 3;

function IdeasOverview({ trip, currentUserId, canAdd, onOpen, onAdd }: IdeasOverviewProps) {
  const ideas = useAppSelector((state) => selectSortedIdeas(state, trip.id));
  const [ideaType, setIdeaType] = useState<IdeaType>('ACTIVITY');
  const undecided = useMemo(
    () => ideas.filter((idea) => idea.convertedToEntityId === null),
    [ideas],
  );
  const onItinerary = ideas.length - undecided.length;

  if (!canAdd) {
    if (ideas.length === 0) {
      return null;
    }

    const summary = `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'}${
      onItinerary > 0 ? `, ${onItinerary} on the itinerary` : ''
    }`;

    return (
      <section className='space-y-1'>
        <h3 className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
          Ideas
        </h3>
        <Button
          type='button'
          variant='tertiary'
          onClick={onOpen}
          className='border-border h-auto w-full justify-start gap-3 rounded-xl border px-3 py-3 text-left'
        >
          <Lightbulb className='text-muted-foreground h-5 w-5 shrink-0' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>Trip ideas</span>
            <span className='text-muted-foreground block text-xs'>{summary}</span>
          </span>
          <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
        </Button>
      </section>
    );
  }

  const preview = undecided.filter((idea) => idea.ideaType === ideaType).slice(0, PREVIEW_COUNT);

  return (
    <section className='border-primary/30 bg-primary/5 space-y-3 rounded-xl border p-4'>
      <div className='flex items-start gap-3'>
        <span className='bg-primary/15 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
          <Lightbulb className='h-4 w-4' />
        </span>
        <div className='min-w-0'>
          <h3 className='font-semibold'>Ideas for the trip</h3>
          <p className='text-muted-foreground text-sm'>
            Drop a spot you&apos;re excited about and vote on the group&apos;s favorites.
          </p>
        </div>
      </div>
      <Tabs value={ideaType} onValueChange={(value) => setIdeaType(value as IdeaType)} variant='pills'>
        <TabsList>
          {IDEA_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {IDEA_TYPE_PLURAL_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {preview.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No {IDEA_TYPE_PLURAL_LABELS[ideaType].toLowerCase()} yet — be the first to add one.
        </p>
      ) : (
        <div className='divide-border divide-y'>
          {preview.map((idea) => {
            const timing = getIdeaTimingSummary(trip, idea);
            return (
              <IdeaDetailsOverlay
                key={idea.id}
                trip={trip}
                idea={idea}
                currentUserId={currentUserId}
                renderTrigger={(openProps) => (
                  <div
                    {...openProps}
                    className='hover:bg-primary/5 flex cursor-pointer items-center justify-between gap-3 py-2'
                  >
                    <span className='flex min-w-0 items-center gap-2 text-sm'>
                      <span aria-hidden='true'>{IDEA_TYPE_EMOJIS[idea.ideaType]}</span>
                      <span className='min-w-0'>
                        <span className='block truncate font-medium'>{idea.title}</span>
                        {timing && (
                          <span className='text-muted-foreground block truncate text-xs'>{timing}</span>
                        )}
                      </span>
                    </span>
                    <span onClick={(clickEvent) => clickEvent.stopPropagation()}>
                      <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
                    </span>
                  </div>
                )}
              />
            );
          })}
        </div>
      )}
      <div className={join('flex items-center gap-3', ideas.length > 0 ? 'justify-between' : 'justify-start')}>
        <Button type='button' size='sm' onClick={() => onAdd(ideaType)}>
          + Add an idea
        </Button>
        {ideas.length > 0 && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0 text-sm'
            onClick={onOpen}
          >
            See all {ideas.length} <ChevronRight className='h-4 w-4' />
          </Button>
        )}
      </div>
    </section>
  );
}

export default IdeasOverview;
