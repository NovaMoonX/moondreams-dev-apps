import { useEffect, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import SuggestionChips from '@/components/SuggestionChips';
import { useAppDispatch } from '@/store';
import { MAX_PERSON_NAME_LENGTH } from '@apps/a-list/constants';
import {
  addSharedCalendar,
  removeSharedCalendar,
} from '@apps/a-list/store/actions/addedCalendarActions';
import { startAddedCalendarsListener } from '@apps/a-list/store/listeners/addedCalendarListeners';
import { startCalendarSharesListener } from '@apps/a-list/store/listeners/calendarShareListeners';
import { startMembershipListener } from '@apps/a-list/store/listeners/membershipListeners';
import type { AddedCalendar, ShareKind } from '@apps/a-list/types';
import {
  findPersonByName,
  groupSharedPeople,
} from '@apps/a-list/utils/friendShowings';

interface ViewerState {
  hasMembership: boolean | null;
  added: AddedCalendar[] | null;
  ownShareIds: string[] | null;
  hasFailed: boolean;
}

const LOADING: ViewerState = {
  hasMembership: null,
  added: null,
  ownShareIds: null,
  hasFailed: false,
};

/** This page sits outside the app's synced screens, so the viewer's membership, added calendars and own links are read here. */
function useViewerState(uid: string) {
  const [state, setState] = useState<ViewerState>(LOADING);

  useEffect(() => {
    const fail = () => setState((current) => ({ ...current, hasFailed: true }));
    const unsubscribes = [
      startMembershipListener(
        uid,
        (membership) =>
          setState((current) => ({
            ...current,
            hasMembership: membership !== null,
          })),
        fail,
      ),
      startAddedCalendarsListener(
        uid,
        (added) => setState((current) => ({ ...current, added })),
        fail,
      ),
      startCalendarSharesListener(
        uid,
        (shares) =>
          setState((current) => ({
            ...current,
            ownShareIds: shares.map((share) => share.id),
          })),
        fail,
      ),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [uid]);

  return state;
}

interface ShowOnMyCalendarProps {
  uid: string;
  shareId: string;
  feedId: string;
  kind: ShareKind;
}

/** Offered only to a signed-in A-List member looking at someone else's link. */
function ShowOnMyCalendar({
  uid,
  shareId,
  feedId,
  kind,
}: ShowOnMyCalendarProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const viewer = useViewerState(uid);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { hasMembership, added, ownShareIds } = viewer;
  if (viewer.hasFailed) {
    return (
      <p className='text-muted-foreground text-center text-sm'>
        Couldn&apos;t check your own calendar, so this can&apos;t be added right
        now. Reload the page to try again.
      </p>
    );
  }
  if (hasMembership === false) {
    return (
      <div className='bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2'>
        <p className='min-w-0 text-sm'>
          📅 Track your own movies to see theirs beside them
        </p>
        <Button
          href='/a-list'
          variant='secondary'
          size='sm'
          rounded='full'
          className='shrink-0 whitespace-nowrap'
        >
          Start A-List
        </Button>
      </div>
    );
  }
  if (hasMembership !== true || added === null || ownShareIds === null) {
    return null;
  }

  if (ownShareIds.includes(shareId)) {
    return (
      <p className='bg-muted/50 text-muted-foreground rounded-2xl p-3 text-center text-sm'>
        🎟️ This is your link.
      </p>
    );
  }

  const current = added.find((calendar) => calendar.id === shareId);
  if (current) {
    const handleRemove = async () => {
      setIsSaving(true);
      const result = await dispatch(removeSharedCalendar({ uid, shareId }));
      setIsSaving(false);
      addToast(
        removeSharedCalendar.fulfilled.match(result)
          ? { title: 'Removed from your calendar', type: 'success' }
          : {
              title: "Couldn't remove it",
              description: result.payload ?? 'Please try again.',
              type: 'error',
            },
      );
    };

    return (
      <div className='bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2'>
        <p className='min-w-0 text-sm font-medium'>
          📅 On your calendar as{' '}
          <span className='wrap-break-word'>{current.personName}</span>
        </p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className='shrink-0 whitespace-nowrap'
          disabled={isSaving}
          onClick={() => void handleRemove()}
        >
          Remove
        </Button>
      </div>
    );
  }

  const people = groupSharedPeople(added, {});
  const match = findPersonByName(people, name);
  const trimmedName = name.trim();

  const closeSheet = () => {
    setIsSheetOpen(false);
    setName('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    const result = await dispatch(
      addSharedCalendar({
        uid,
        shareId,
        feedId,
        kind,
        personName: trimmedName,
        takenNames: people.map((person) => person.personName),
        isJoining: match !== null,
      }),
    );
    setIsSaving(false);
    if (addSharedCalendar.fulfilled.match(result)) {
      addToast({
        title: `Added to your calendar as ${match?.personName ?? trimmedName}`,
        type: 'success',
      });
      closeSheet();
      return;
    }
    addToast({
      title: "Couldn't add it",
      description: result.payload ?? 'Please try again.',
      type: 'error',
    });
  };

  return (
    <>
      <div className='bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>📅 Show on my calendar</p>
          <p className='text-muted-foreground text-xs'>
            Their movies appear quietly on your calendar
          </p>
        </div>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className='shrink-0 whitespace-nowrap'
          onClick={() => setIsSheetOpen(true)}
        >
          Add
        </Button>
      </div>
      <FormSheet
        isOpen={isSheetOpen}
        onClose={closeSheet}
        title='Who is this from?'
      >
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName !== '' && !isSaving) void handleSave();
          }}
        >
          <Input
            variant='outline'
            rounded='full'
            className='h-12 text-base'
            aria-label='Their name'
            placeholder='Sam'
            autoFocus
            autoComplete='off'
            maxLength={MAX_PERSON_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {people.length > 0 && (
            <SuggestionChips
              label='Already on your calendar'
              suggestions={people.map((person) => person.personName)}
              onPick={setName}
              isDisabled={isSaving}
            />
          )}
          {match ? (
            <InlineNotice tone='info'>
              {match.personName} is already on your calendar. Add this to them
              and both links show as one person, or type a different name.
            </InlineNotice>
          ) : (
            <p className='text-muted-foreground text-sm'>
              Their movies show under this name on your calendar.
            </p>
          )}
          <ModalFooterActions
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                rounded='full'
                disabled={isSaving}
                onClick={closeSheet}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                rounded='full'
                disabled={trimmedName === '' || isSaving}
              >
                {match ? `Add to ${match.personName}` : 'Add'}
              </Button>
            }
          />
        </form>
      </FormSheet>
    </>
  );
}

export default ShowOnMyCalendar;
