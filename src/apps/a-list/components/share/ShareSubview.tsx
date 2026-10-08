import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionHeader from '@/components/SectionHeader';
import Subview, { SubviewHeader } from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import ShareCreateForm from '@apps/a-list/components/share/ShareCreateForm';
import ShareRow from '@apps/a-list/components/share/ShareRow';
import { MAX_CALENDAR_SHARES } from '@apps/a-list/constants';
import {
  createCalendarShare,
  deleteCalendarShare,
  setCalendarSharePin,
} from '@apps/a-list/store/actions/calendarShareActions';
import {
  selectAreCalendarSharesLoaded,
  selectCalendarShares,
  selectCalendarSharesLoadError,
} from '@apps/a-list/store/selectors';
import type { CalendarShare } from '@apps/a-list/types';
import { formatShareRange, type DayKeyRange } from '@apps/a-list/utils/sharing';

interface ShareSubviewProps {
  onClose: () => void;
}

function ShareSubview({ onClose }: ShareSubviewProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const shares = useAppSelector(selectCalendarShares);
  const viewings = useAppSelector((state) => state.aList.viewings.items);
  const isLoaded = useAppSelector(selectAreCalendarSharesLoaded);
  const loadError = useAppSelector(selectCalendarSharesLoadError);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isFull = shares.length >= MAX_CALENDAR_SHARES;

  if (!user) {
    return null;
  }

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setIsSaving(true);
    try {
      await action();
      return true;
    } catch (error) {
      addToast({
        title: 'Something went wrong',
        description: getErrorMessage(error, fallback),
        type: 'error',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (range: DayKeyRange, hasPin: boolean) => {
    const didCreate = await run(
      () =>
        dispatch(
          createCalendarShare({ uid: user.uid, range, viewings, hasPin }),
        ).unwrap(),
      'Unable to create this link.',
    );
    if (didCreate) {
      setIsCreating(false);
      addToast({
        title: 'Your link is ready',
        description: 'Tap "Copy link" to send it.',
        type: 'success',
      });
    }
    return didCreate;
  };

  const handleTogglePin = (share: CalendarShare, isLocked: boolean) =>
    run(
      () =>
        dispatch(
          setCalendarSharePin({ shareId: share.id, isLocked }),
        ).unwrap(),
      'Unable to change this PIN.',
    );

  const handleDelete = async (share: CalendarShare) => {
    const confirmed = await confirm({
      title: 'Delete link',
      message: `Delete the link for ${formatShareRange(share.startDate, share.endDate)}${share.pin ? ` (PIN ${share.pin})` : ''}, made ${formatDateTime(share.createdAt)}? Anyone who has it will lose access right away, and this can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await run(
      () => dispatch(deleteCalendarShare(share.id)).unwrap(),
      'Unable to delete this link.',
    );
  };

  if (isCreating) {
    return (
      <Subview onClose={onClose}>
        <SubviewHeader
          title='Back to links'
          onBack={() => setIsCreating(false)}
        />
        <ShareCreateForm
          isDisabled={isSaving}
          onCreate={handleCreate}
          onCancel={() => setIsCreating(false)}
        />
      </Subview>
    );
  }

  const getBody = () => {
    if (loadError) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          We couldn&apos;t load your shared calendars just now. Check your
          connection and come back in a moment.
        </p>
      );
    }
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your links…
        </p>
      );
    }
    if (shares.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          🎟️ Nothing shared yet. Make a link and anyone you send it to can see
          your movie plans, no sign-in needed.
        </p>
      );
    }

    return (
      <>
        <ul className='divide-border divide-y'>
          {shares.map((share) => (
            <ShareRow
              key={share.id}
              share={share}
              isDisabled={isSaving}
              onCopied={() => addToast({ title: 'Link copied', type: 'success' })}
              onTogglePin={(item, isLocked) =>
                void handleTogglePin(item, isLocked)
              }
              onDelete={(item) => void handleDelete(item)}
            />
          ))}
        </ul>
        {isFull && (
          <p className='text-muted-foreground text-sm'>
            That&apos;s {MAX_CALENDAR_SHARES} links, the most you can have at
            once. Delete one to make another.
          </p>
        )}
      </>
    );
  };

  return (
    <Subview title='Shared calendars' onClose={onClose}>
      <div className='space-y-4'>
        <SectionHeader
          title='Shared calendars'
          subtitle={
            shares.length === 0
              ? undefined
              : `${shares.length} of ${MAX_CALENDAR_SHARES} links`
          }
          action={
            !isFull && !loadError && viewings.length > 0 ? (
              <Button
                type='button'
                size='sm'
                rounded='full'
                onClick={() => setIsCreating(true)}
              >
                + New
              </Button>
            ) : undefined
          }
        />
        {getBody()}
      </div>
    </Subview>
  );
}

export default ShareSubview;
