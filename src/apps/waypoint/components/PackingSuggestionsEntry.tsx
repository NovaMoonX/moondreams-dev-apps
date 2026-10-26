import { useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, Luggage, X } from 'lucide-react';

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

interface PackingChoices {
  isDismissed: boolean;
  skipped: string[];
  added: string[];
}

const NO_CHOICES: PackingChoices = { isDismissed: false, skipped: [], added: [] };

const readChoices = (key: string): PackingChoices => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    return stored && Array.isArray(stored.skipped) && Array.isArray(stored.added)
      ? {
          isDismissed: stored.isDismissed === true,
          skipped: stored.skipped.filter((title: unknown) => typeof title === 'string'),
          added: stored.added.filter((title: unknown) => typeof title === 'string'),
        }
      : NO_CHOICES;
  } catch {
    return NO_CHOICES;
  }
};

function PackingSuggestionsEntry({ trip, currentUserId }: PackingSuggestionsEntryProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const storageKey = `waypoint:${currentUserId}:packing:${trip.id}`;
  const [choices, setChoices] = useState(() => readChoices(storageKey));
  const latestChoices = useRef(choices);
  const [isOpen, setIsOpen] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  const events = useAppSelector(selectSortedTimelineEvents);
  const sharedItems = useAppSelector((state) => state.waypoint.checklist.items);
  const personalItems = useAppSelector(selectPersonalChecklistItems);
  const isLoaded = useAppSelector(
    (state) => state.waypoint.checklist.tripId === trip.id && state.waypoint.personalChecklist.tripId === trip.id,
  );
  const weather = useTripWeather(trip, events, now);

  const updateChoices = (change: (current: PackingChoices) => PackingChoices) => {
    const next = change(latestChoices.current);
    latestChoices.current = next;
    setChoices(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The choice still holds for this visit.
    }
  };

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
  // An item the person added and later took off their list is a "no" too, once both lists have loaded.
  const isSkipped = (title: string) =>
    choices.skipped.includes(title) || (isLoaded && choices.added.includes(title) && !isListed(title) && !isPending(title));

  const groups = suggestions.map((suggestion) => ({
    ...suggestion,
    active: suggestion.items.filter((title) => !isSkipped(title)),
    skippedItems: suggestion.items.filter((title) => isSkipped(title) && !isListed(title)),
  }));
  const skippedAll = groups.flatMap(({ skippedItems }) => skippedItems);
  const missing = groups.flatMap(({ active, title: kind }) =>
    active.filter((title) => !isListed(title) && !isPending(title)).map((title) => ({ title, kind })),
  );
  const activeTotal = groups.reduce((sum, { active }) => sum + active.length, 0);

  if (
    trip.isArchived ||
    !isLoaded ||
    (missing.length === 0 && skippedAll.length === 0 && !isOpen) ||
    getLocalDayIndex(trip.startDate, now) >= 0
  ) {
    return null;
  }

  const firstReason = groups.find(({ active }) => active.some((title) => !isListed(title)))?.reason ?? '';
  const kinds = groups
    .filter(({ active }) => active.some((title) => !isListed(title)))
    .map(({ emoji, title }) => `${emoji} ${title}`)
    .join(' · ');

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
    const added = entries.filter((_, index) => results[index].status === 'fulfilled').map(({ title }) => title);
    updateChoices((current) => ({ ...current, added: [...new Set([...current.added, ...added])] }));
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

  const skip = (title: string) =>
    updateChoices((current) => ({ ...current, skipped: [...new Set([...current.skipped, title])] }));
  const bringBack = (title: string) =>
    updateChoices((current) => ({
      ...current,
      skipped: current.skipped.filter((entry) => entry !== title),
      added: current.added.filter((entry) => entry !== title),
    }));

  return (
    <div className='mt-5'>
      {missing.length === 0 ? (
        skippedAll.length > 0 && (
          <SectionEntryRow
            heading='Pack for the weather'
            icon={<Luggage className='h-5 w-5' />}
            title={`${skippedAll.length} you skipped`}
            summary='Bring any of them back'
            onOpen={() => {
              setShowSkipped(true);
              setIsOpen(true);
            }}
          />
        )
      ) : choices.isDismissed ? (
        <SectionEntryRow
          heading='Pack for the weather'
          icon={<Luggage className='h-5 w-5' />}
          title={`${missing.length} ${missing.length === 1 ? 'thing' : 'things'} left to wear or bring`}
          summary={kinds}
          onOpen={() => setIsOpen(true)}
        />
      ) : (
        <section className='bg-accent/40 border-accent space-y-3 rounded-2xl border p-4'>
          <div className='flex items-start gap-3'>
            <span className='bg-accent text-accent-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
              <Luggage className='h-4 w-4' aria-hidden='true' />
            </span>
            <div className='min-w-0'>
              <h3 className='font-semibold'>Pack for the weather</h3>
              <p className='text-sm'>{firstReason}</p>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {missing.length} {missing.length === 1 ? 'thing' : 'things'} to wear or bring · {kinds}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Button type='button' className='flex-1 whitespace-nowrap' onClick={() => setIsOpen(true)}>
              Choose items
            </Button>
            <Button
              type='button'
              variant='tertiary'
              className='whitespace-nowrap'
              onClick={() => updateChoices((current) => ({ ...current, isDismissed: true }))}
            >
              Not for me
            </Button>
          </div>
        </section>
      )}
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title='Pack for the weather'
        footer={
          <div className='flex items-center gap-2'>
            {missing.length > 0 ? (
              <Button type='button' size='lg' className='flex-1' onClick={() => void add(missing)}>
                Add {missing.length === activeTotal ? 'all' : missing.length} to my list
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
            Based on the forecast for the days ahead. Added items go on your own packing list; only you see them. Tap the
            ✕ on anything you don&apos;t need.
          </p>
          {groups
            .filter(({ active }) => active.length > 0)
            .map(({ id, emoji, title, reason, active }) => (
              <div key={id} className='space-y-1'>
                <SectionDivider label={`${emoji} ${title}`} />
                <p className='text-muted-foreground text-xs'>{reason}</p>
                <ul className='divide-border divide-y'>
                  {active.map((item) => (
                    <li key={item} className='flex min-h-11 items-center gap-2'>
                      <span className='min-w-0 flex-1 text-sm font-medium'>{item}</span>
                      {isListed(item) ? (
                        <span className='text-muted-foreground flex shrink-0 items-center gap-1 text-xs whitespace-nowrap'>
                          <Check className='h-3.5 w-3.5' aria-hidden='true' /> On your list
                        </span>
                      ) : (
                        <>
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
                          <Button
                            type='button'
                            variant='tertiary'
                            size='sm'
                            className='relative shrink-0 px-2 before:absolute before:-inset-1.5 before:content-[""]'
                            aria-label={`I don't need ${item}`}
                            title="I don't need this"
                            disabled={isPending(item)}
                            onClick={() => skip(item)}
                          >
                            <X className='h-4 w-4' aria-hidden='true' />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {skippedAll.length > 0 && (
            <div className='space-y-1'>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='relative h-auto px-0! before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[""]'
                onClick={() => setShowSkipped((current) => !current)}
              >
                {skippedAll.length} you skipped · {showSkipped ? 'Hide' : 'Show'}
              </Button>
              {showSkipped && (
                <ul className='divide-border divide-y'>
                  {skippedAll.map((item) => (
                    <li key={item} className='flex min-h-11 items-center gap-2'>
                      <span className='text-muted-foreground min-w-0 flex-1 text-sm'>{item}</span>
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        className='relative shrink-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[""]'
                        onClick={() => bringBack(item)}
                      >
                        Bring back
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {choices.isDismissed && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='relative h-auto px-0! before:absolute before:-inset-y-2 before:inset-x-0 before:content-[""]'
              onClick={() => updateChoices((current) => ({ ...current, isDismissed: false }))}
            >
              Show this as a card on Overview again
            </Button>
          )}
        </div>
      </DetailSheet>
    </div>
  );
}

export default PackingSuggestionsEntry;
