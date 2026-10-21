import { useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, Luggage } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayCount, getDayDateLabel, getLocalDayIndex } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import SectionEntryRow from '@apps/waypoint/components/SectionEntryRow';
import { useTripWeather } from '@apps/waypoint/hooks/useTripWeather';
import { createChecklistItem } from '@apps/waypoint/store/actions/checklistActions';
import { selectPersonalChecklistItems, selectSortedTimelineEvents } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { getPackingSuggestions, type PackingDay } from '@apps/waypoint/utils/packingSuggestions';

interface PackingSuggestionsEntryProps {
  trip: TripSpace;
  currentUserId: string;
}

function PackingSuggestionsEntry({ trip, currentUserId }: PackingSuggestionsEntryProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  const events = useAppSelector(selectSortedTimelineEvents);
  const sharedItems = useAppSelector((state) => state.waypoint.checklist.items);
  const personalItems = useAppSelector(selectPersonalChecklistItems);
  const weather = useTripWeather(trip, events, now);

  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const todayIndex = Math.max(0, getLocalDayIndex(trip.startDate, now));
  const days = Array.from({ length: Math.max(0, dayCount - todayIndex) }, (_, offset) => todayIndex + offset).flatMap(
    (dayIndex): PackingDay[] => {
      const forecast = weather.getDay(dayIndex);
      return forecast ? [{ dayIndex, forecast }] : [];
    },
  );
  const suggestions = getPackingSuggestions(days, (dayIndex) => getDayDateLabel(trip.startDate, dayIndex, false));

  const listed = useMemo(
    () =>
      new Set(
        [...sharedItems, ...personalItems]
          .filter((item) => item.tripId === trip.id)
          .map((item) => item.title.trim().toLowerCase()),
      ),
    [sharedItems, personalItems, trip.id],
  );
  const isListed = (title: string) => listed.has(title.toLowerCase());
  const isPending = (title: string) => pending.includes(title);

  const missing = suggestions.flatMap(({ items, title: kind }) =>
    items.filter((title) => !isListed(title) && !isPending(title)).map((title) => ({ title, kind })),
  );
  const total = suggestions.reduce((sum, { items }) => sum + items.length, 0);
  const hasLeft = suggestions.some(({ items }) => items.some((title) => !isListed(title)));

  if (trip.isArchived || (!hasLeft && !isOpen) || getLocalDayIndex(trip.startDate, now) >= 0) {
    return null;
  }

  const add = async (requested: { title: string; kind: string }[]) => {
    const entries = requested.filter(({ title }) => !inFlight.current.has(title) && !listed.has(title.toLowerCase()));
    if (entries.length === 0) {
      return;
    }
    entries.forEach(({ title }) => inFlight.current.add(title));
    setPending((current) => [...current, ...entries.map(({ title }) => title)]);
    const results = await Promise.allSettled(
      entries.map(({ title, kind }) =>
        dispatch(
          createChecklistItem({
            tripId: trip.id,
            uid: currentUserId,
            title,
            category: 'PACKING',
            customCategoryLabel: null,
            note: `Suggested for ${kind.toLowerCase()}`,
            completeByDayIndex: null,
            assignedToUids: [],
            isPrivate: true,
          }),
        ).unwrap(),
      ),
    );
    entries.forEach(({ title }) => inFlight.current.delete(title));
    setPending((current) => current.filter((title) => !entries.some((entry) => entry.title === title)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
      addToast({
        title: `${failures.length} of ${entries.length} couldn't be added`,
        description: getErrorMessage(failures[0].reason, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <div className='mt-5'>
      <SectionEntryRow
        heading='Pack for the weather'
        icon={<Luggage className='h-5 w-5' />}
        title={`${missing.length} ${missing.length === 1 ? 'thing' : 'things'} left to wear or bring`}
        summary={suggestions.map(({ emoji, title }) => `${emoji} ${title}`).join(' · ')}
        onOpen={() => setIsOpen(true)}
      />
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title='Pack for the weather'
        footer={
          <div className='flex items-center gap-2'>
            {missing.length > 0 ? (
              <Button type='button' size='lg' className='flex-1' onClick={() => void add(missing)}>
                Add {missing.length === total ? 'all' : missing.length} to my list
              </Button>
            ) : (
              <Button type='button' size='lg' className='flex-1' onClick={() => setIsOpen(false)}>
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Based on the forecast for the days ahead. Added items go on your own packing list; only you see them.
          </p>
          {suggestions.map(({ id, emoji, title, reason, items }) => (
            <div key={id} className='space-y-1'>
              <SectionDivider label={`${emoji} ${title}`} />
              <p className='text-muted-foreground text-xs'>{reason}</p>
              <ul className='divide-border divide-y'>
                {items.map((item) => (
                  <li key={item} className='flex min-h-11 items-center gap-3'>
                    <span className='min-w-0 flex-1 text-sm font-medium'>{item}</span>
                    {isListed(item) ? (
                      <span className='text-muted-foreground flex shrink-0 items-center gap-1 text-xs whitespace-nowrap'>
                        <Check className='h-3.5 w-3.5' aria-hidden='true' /> On your list
                      </span>
                    ) : (
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        className='relative shrink-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[""]'
                        disabled={isPending(item)}
                        onClick={() => void add([{ title: item, kind: title }])}
                      >
                        {isPending(item) ? 'Adding…' : 'Add'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DetailSheet>
    </div>
  );
}

export default PackingSuggestionsEntry;
