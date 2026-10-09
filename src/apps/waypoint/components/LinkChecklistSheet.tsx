import { useMemo, useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DetailSheet from '@/components/DetailSheet';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { CHECKLIST_CATEGORY_EMOJIS, LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
import { linkChecklistItems, toggleChecklistItem, unlinkChecklistItems } from '@apps/waypoint/store/actions/checklistActions';
import { setPlanNeedsNoBooking } from '@apps/waypoint/store/actions/tripActions';
import { selectTimelineEvents } from '@apps/waypoint/store/selectors';
import type { ChecklistItem, TripSpace } from '@apps/waypoint/types';
import { getLiveLink, isLinkedTo } from '@apps/waypoint/utils/bookingItems';
import { canEditExistingItem } from '@apps/waypoint/utils/roleGuards';
import { getExpenseLinkKey, type RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface LinkChecklistSheetProps {
  trip: TripSpace;
  subject: RelatedSubject;
  currentUserId: string;
  onAddNew: () => void;
  onClose: () => void;
}

function LinkChecklistSheet({ trip, subject, currentUserId, onAddNew, onClose }: LinkChecklistSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const items = useAppSelector((state) => state.waypoint.checklist.items);
  const events = useAppSelector(selectTimelineEvents);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const eventIds = useMemo(() => new Set(events.map((event) => event.id)), [events]);
  const linkedHere = useMemo(
    () => items.filter((item) => isLinkedTo(item, subject.link, eventIds)),
    [items, subject.link, eventIds],
  );
  const available = useMemo(
    () =>
      items
        .filter((item) => getLiveLink(item, eventIds) === null)
        .sort(
          (first, second) =>
            Number(first.isCompleted) - Number(second.isCompleted) ||
            Number(second.category === 'BOOKINGS') - Number(first.category === 'BOOKINGS') ||
            (first.completeByDayIndex ?? Infinity) - (second.completeByDayIndex ?? Infinity),
        ),
    [items, eventIds],
  );
  const term = query.trim().toLowerCase();
  const visible = term ? available.filter((item) => item.title.toLowerCase().includes(term)) : available;

  const run = async (action: () => Promise<unknown>, failure: string, success?: { title: string }) => {
    setIsBusy(true);
    try {
      await action();
      if (success) {
        addToast({ ...success, type: 'success' });
      }
      return true;
    } catch (error) {
      addToast({ title: failure, description: getErrorMessage(error, 'Please try again.'), type: 'error' });
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const linkPicked = async () => {
    const linked = await run(
      () => dispatch(linkChecklistItems({ tripId: trip.id, itemIds: picked, link: subject.link })).unwrap(),
      'Unable to link those',
      { title: `Linked ${picked.length === 1 ? '1 to-do' : `${picked.length} to-dos`} to ${subject.title}` },
    );
    if (linked) {
      onClose();
    }
  };

  const toggleDone = (item: ChecklistItem, isCompleted: boolean) =>
    run(
      () => dispatch(toggleChecklistItem({ tripId: trip.id, itemId: item.id, uid: currentUserId, isCompleted, isPrivate: false })).unwrap(),
      'Unable to update that to-do',
    );

  const unlink = (item: ChecklistItem) =>
    run(
      () => dispatch(unlinkChecklistItems({ tripId: trip.id, itemIds: [item.id], link: subject.link })).unwrap(),
      'Unable to unlink that',
      { title: `Unlinked ${item.title} from ${subject.title}` },
    );

  const markNothingToBook = async () => {
    const marked = await run(
      () =>
        dispatch(
          setPlanNeedsNoBooking({ uid: currentUserId, trip, linkKey: getExpenseLinkKey(subject.link), needsNone: true }),
        ).unwrap(),
      'Unable to save that',
      { title: `Nothing to book for ${subject.title}` },
    );
    if (marked) {
      onClose();
    }
  };

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title='Bookings'
      footer={
        <div className='flex flex-col gap-2'>
          {picked.length > 0 ? (
            <Button type='button' size='lg' disabled={isBusy} onClick={() => void linkPicked()}>
              Link {picked.length === 1 ? '1 to-do' : `${picked.length} to-dos`}
            </Button>
          ) : (
            <Button type='button' size='lg' disabled={isBusy} onClick={onAddNew}>
              Add a new to-do
            </Button>
          )}
          {picked.length > 0 ? (
            <Button type='button' variant='secondary' size='lg' className='border-border border' disabled={isBusy} onClick={onAddNew}>
              Add a new to-do
            </Button>
          ) : (
            linkedHere.length === 0 && (
              <Button type='button' variant='secondary' size='lg' className='border-border border' disabled={isBusy} onClick={() => void markNothingToBook()}>
                Nothing to book
              </Button>
            )
          )}
          {linkedHere.length === 0 && picked.length === 0 && (
            <p className='text-muted-foreground text-center text-xs'>
              <span className='text-foreground font-medium'>Hides this reminder for everyone.</span> Undo it from this event&apos;s details.
            </p>
          )}
        </div>
      }
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          For <span className='text-foreground font-medium'>{subject.title}</span>. To-dos linked here show up in Before the Road too.
        </p>
        {linkedHere.length > 0 && (
          <ul className='divide-border divide-y'>
            {linkedHere.map((item) => (
              <li key={item.id} className='flex min-h-12 items-center gap-3 py-2'>
                <span className='inline-flex w-5 shrink-0 justify-center'>
                  <Checkbox
                    checked={item.isCompleted}
                    disabled={isBusy || !(canEditExistingItem(trip, currentUserId) || item.assignedToUids.includes(currentUserId))}
                    aria-label={`Mark ${item.title} done`}
                    onCheckedChange={(checked) => void toggleDone(item, checked)}
                  />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>{item.title}</span>
                  <span className='text-muted-foreground block text-xs'>{item.isCompleted ? 'Done, so this counts as booked' : 'Tick it off once it is booked'}</span>
                </span>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className="text-muted-foreground relative h-auto px-0! text-xs whitespace-nowrap after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                  disabled={isBusy}
                  aria-label={`Unlink ${item.title}`}
                  onClick={() => void unlink(item)}
                >
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 ? (
          <div className='space-y-3'>
            <SectionDivider label='Already on your checklist' />
            {available.length >= LIST_SEARCH_THRESHOLD && (
              <SearchInput value={query} onChange={setQuery} placeholder='Search your checklist' />
            )}
            {picked.length > 0 && term && (
              <p className='text-muted-foreground text-xs'>
                {picked.length} selected, including any the search hides.
              </p>
            )}
            {visible.length === 0 ? (
              <p className='text-muted-foreground text-sm'>No to-do matches.</p>
            ) : (
              <ul className={join('divide-border max-h-64 divide-y overflow-y-auto', term && 'min-h-64')}>
                {visible.map((item) => (
                  <li key={item.id}>
                    <label className='flex min-h-12 cursor-pointer items-center gap-3 py-2'>
                      <span className='inline-flex w-5 shrink-0 justify-center'>
                        <Checkbox
                          checked={picked.includes(item.id)}
                          onCheckedChange={(checked) =>
                            setPicked((current) =>
                              checked ? [...current, item.id] : current.filter((pickedId) => pickedId !== item.id),
                            )
                          }
                        />
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>{item.title}</span>
                        <span className='text-muted-foreground block text-xs'>
                          {CHECKLIST_CATEGORY_EMOJIS[item.category]}{' '}
                          {item.isCompleted
                            ? 'Done'
                            : item.completeByDayIndex === null
                              ? 'No due day'
                              : `Due ${getDayLabel(trip.startDate, item.completeByDayIndex, dayCount)}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          linkedHere.length === 0 && (
            <p className='text-muted-foreground text-sm'>Nothing open on your checklist yet. Add a to-do and it will be linked here.</p>
          )
        )}
      </div>
    </DetailSheet>
  );
}

export default LinkChecklistSheet;
