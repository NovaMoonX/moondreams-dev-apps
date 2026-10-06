import { useState } from 'react';

import { Button, Tabs, TabsList, TabsTrigger } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import IdeaCard from '@apps/waypoint/components/IdeaCard';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { IDEA_TYPE_PLURAL_LABELS, IDEA_TYPES } from '@apps/waypoint/constants';
import { filterIdeasByType, selectSortedIdeas } from '@apps/waypoint/store/selectors';
import type { IdeaType, TripSpace } from '@apps/waypoint/types';

interface IdeasSectionProps {
  trip: TripSpace;
  currentUserId: string;
  canAdd: boolean;
  onAdd: (ideaType: IdeaType) => void;
}

const ALL_IDEAS = 'ALL';

function IdeasSection({ trip, currentUserId, canAdd, onAdd }: IdeasSectionProps) {
  const ideas = useAppSelector((state) => selectSortedIdeas(state, trip.id));
  const [filter, setFilter] = useState<string>(ALL_IDEAS);
  const ideaType = IDEA_TYPES.find((type) => type === filter) ?? null;
  const visibleIdeas = filterIdeasByType(ideas, ideaType);
  const undecided = visibleIdeas.filter((idea) => idea.convertedToEntityId === null);
  const onItinerary = visibleIdeas.filter((idea) => idea.convertedToEntityId !== null);

  const renderCards = (items: typeof visibleIdeas) => (
    <div className='space-y-3'>
      {items.map((idea) => (
        <IdeaCard key={idea.id} trip={trip} idea={idea} currentUserId={currentUserId} />
      ))}
    </div>
  );

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Ideas'
        subtitle={
          canAdd
            ? "Drop a spot you're excited about — the group votes on favorites."
            : 'New ideas close once the trip starts, but voting stays open.'
        }
        action={
          canAdd && (
            <Button type='button' className='shrink-0' onClick={() => onAdd(ideaType ?? 'RESTAURANT')}>
              Add
            </Button>
          )
        }
      />
      <Tabs value={filter} onValueChange={setFilter} variant='pills'>
        <TabsList>
          <TabsTrigger value={ALL_IDEAS}>All</TabsTrigger>
          {IDEA_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {IDEA_TYPE_PLURAL_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {visibleIdeas.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          {canAdd ? 'No ideas yet — be the first to add one.' : 'No ideas were added before the trip.'}
        </p>
      )}
      {undecided.length > 0 && renderCards(undecided)}
      {onItinerary.length > 0 && (
        <>
          <SectionDivider label='Already on the itinerary' />
          {renderCards(onItinerary)}
        </>
      )}
    </section>
  );
}

export default IdeasSection;
