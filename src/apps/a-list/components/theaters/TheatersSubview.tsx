import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionHeader from '@/components/SectionHeader';
import Subview, { SubviewHeader } from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import TheaterFinder from '@apps/a-list/components/theaters/TheaterFinder';
import TheaterList from '@apps/a-list/components/theaters/TheaterList';
import TheaterPicker from '@apps/a-list/components/theaters/TheaterPicker';
import { MAX_THEATRES } from '@apps/a-list/constants';
import {
  addTheatre,
  linkTheatre,
  removeTheatre,
  setFavoriteTheatre,
} from '@apps/a-list/store/actions/theatreActions';
import {
  selectMembership,
  selectShowingCountByTheatreId,
  selectTheatres,
} from '@apps/a-list/store/selectors';
import type {
  TheatreSearchResult,
  TheatreSnapshot,
  TheatreDraft,
} from '@apps/a-list/types';

interface TheatersSubviewProps {
  onClose: () => void;
}

function TheatersSubview({ onClose }: TheatersSubviewProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const theatres = useAppSelector(selectTheatres);
  const membership = useAppSelector(selectMembership);
  const showingCounts = useAppSelector(selectShowingCountByTheatreId);
  const [isAdding, setIsAdding] = useState(false);
  const [linking, setLinking] = useState<TheatreSnapshot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const favoriteId = membership?.favoriteTheatreId ?? null;

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

  const handleAdd = async (theatre: TheatreDraft) => {
    const didSave = await run(
      () =>
        dispatch(
          addTheatre({
            uid: user.uid,
            theatre,
            isFirst: theatres.length === 0,
          }),
        ).unwrap(),
      'Unable to save this theater.',
    );
    if (didSave) {
      setIsAdding(false);
    }
    return didSave;
  };

  const handleLink = async (target: TheatreSearchResult) => {
    if (!linking) {
      return;
    }

    const taggedCount = showingCounts[linking.theatreId] ?? 0;
    const confirmed = await confirm({
      title: 'Link to AMC',
      message: `${target.name} replaces “${linking.name}”, so the name and city come from AMC${taggedCount === 0 ? '' : ` and show on the ${taggedCount === 1 ? '1 showing' : `${taggedCount} showings`} tagged with it`}. Your own spelling is not kept.`,
      confirmText: 'Link',
    });
    if (!confirmed) {
      return;
    }

    const didLink = await run(
      () =>
        dispatch(
          linkTheatre({
            uid: user.uid,
            fromTheatreId: linking.theatreId,
            to: target,
          }),
        ).unwrap(),
      'Unable to link this theater.',
    );
    if (didLink) {
      addToast({
        title: 'Linked',
        description: `${linking.name} is now ${target.name}.`,
        type: 'success',
      });
      setLinking(null);
    }
  };

  const handleToggleFavorite = (theatreId: string) =>
    run(
      () =>
        dispatch(
          setFavoriteTheatre({
            uid: user.uid,
            theatreId: theatreId === favoriteId ? null : theatreId,
          }),
        ).unwrap(),
      'Unable to change your favorite theater.',
    );

  const handleRemove = async (theatre: TheatreSnapshot) => {
    const confirmed = await confirm({
      title: 'Remove theater',
      message: `Remove ${theatre.name}? Showings you've already saved there keep its name.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await run(
      () =>
        dispatch(
          removeTheatre({
            uid: user.uid,
            theatreId: theatre.theatreId,
            nextFavoriteId:
              theatres.find((item) => item.theatreId !== theatre.theatreId)
                ?.theatreId ?? null,
          }),
        ).unwrap(),
      'Unable to remove this theater.',
    );
  };

  if (linking) {
    const taggedCount = showingCounts[linking.theatreId] ?? 0;
    return (
      <Subview onClose={onClose}>
        <SubviewHeader
          title='Back to theaters'
          onBack={() => setLinking(null)}
        />
        <div className='space-y-3'>
          <div className='space-y-1'>
            <h3 className='font-medium'>Link {linking.name} to AMC</h3>
            <p className='text-muted-foreground text-sm'>
              Find it in AMC’s list.{' '}
              <strong className='text-foreground'>
                AMC’s name and city replace “{linking.name}”
              </strong>
              {taggedCount === 0
                ? '.'
                : `, and the ${taggedCount === 1 ? '1 showing' : `${taggedCount} showings`} tagged with it switch over, so nothing needs re-tagging.`}
            </p>
          </div>
          <TheaterFinder
            savedIds={[]}
            isDisabled={isSaving}
            actionLabel='Link'
            onAdd={(target) => void handleLink(target)}
          />
        </div>
      </Subview>
    );
  }

  if (isAdding) {
    return (
      <Subview onClose={onClose}>
        <SubviewHeader
          title='Back to theaters'
          onBack={() => setIsAdding(false)}
        />
        <TheaterPicker
          savedIds={theatres.map((theatre) => theatre.theatreId)}
          savedNames={theatres.map((theatre) => theatre.name)}
          isDisabled={isSaving}
          onAdd={handleAdd}
        />
      </Subview>
    );
  }

  return (
    <Subview title='Theaters' onClose={onClose}>
      <div className='space-y-4'>
        <SectionHeader
          title='Theaters'
          subtitle={
            theatres.length === 0
              ? undefined
              : theatres.length === 1
                ? '1 theater'
                : `${theatres.length} theaters`
          }
          action={
            theatres.length < MAX_THEATRES ? (
              <Button
                type='button'
                size='sm'
                rounded='full'
                onClick={() => setIsAdding(true)}
              >
                + Add
              </Button>
            ) : undefined
          }
        />
        {theatres.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            No theaters yet. Add the ones you go to and we'll tag your movies
            with them.
          </p>
        ) : (
          <>
            <TheaterList
              theatres={theatres}
              favoriteId={favoriteId}
              isDisabled={isSaving}
              onToggleFavorite={(theatreId) =>
                void handleToggleFavorite(theatreId)
              }
              onRemove={(theatre) => void handleRemove(theatre)}
              onLink={setLinking}
            />
            <p className='text-muted-foreground text-sm'>
              Your favorite is the one we pick first when you add a movie.
            </p>
          </>
        )}
      </div>
    </Subview>
  );
}

export default TheatersSubview;
