import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import TheaterFinder from '@apps/a-list/components/theaters/TheaterFinder';
import TheaterPicker from '@apps/a-list/components/theaters/TheaterPicker';
import {
  addTheatre,
  linkTheatre,
} from '@apps/a-list/store/actions/theatreActions';
import {
  selectShowingCountByTheatreId,
  selectTheatres,
} from '@apps/a-list/store/selectors';
import type {
  TheatreDraft,
  TheatreSearchResult,
  TheatreSnapshot,
} from '@apps/a-list/types';
import { toTheatreSnapshot } from '@apps/a-list/utils/theatres';

interface TheaterSheetModalProps {
  /** The typed theater to link to its AMC one; null to add a new theater. */
  linking: TheatreSnapshot | null;
  onClose: () => void;
  /** Called with the saved theater, so the form that opened this can pick it. */
  onDone: (theatre: TheatreSnapshot) => void;
}

/** Add or link a theater without leaving the form that needs it. */
function TheaterSheetModal({
  linking,
  onClose,
  onDone,
}: TheaterSheetModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const theatres = useAppSelector(selectTheatres);
  const showingCounts = useAppSelector(selectShowingCountByTheatreId);
  const [isSaving, setIsSaving] = useState(false);

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
      onDone(toTheatreSnapshot(theatre));
      onClose();
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
      onDone(toTheatreSnapshot(target));
      onClose();
    }
  };

  return (
    <Modal isOpen onClose={onClose} title='Theater'>
      <div className='space-y-4'>
        {linking ? (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              Find it in AMC’s list.{' '}
              <strong className='text-foreground'>
                AMC’s name and city replace “{linking.name}”
              </strong>
              , and you’ll see its showtimes.
            </p>
            <TheaterFinder
              isCompact
              savedIds={[]}
              isDisabled={isSaving}
              actionLabel='Link'
              onAdd={(target) => void handleLink(target)}
            />
          </div>
        ) : (
          <TheaterPicker
            isCompact
            savedIds={theatres.map((theatre) => theatre.theatreId)}
            savedNames={theatres.map((theatre) => theatre.name)}
            isDisabled={isSaving}
            onAdd={handleAdd}
          />
        )}
        <ModalFooterActions
          rightActions={
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              onClick={onClose}
            >
              Close
            </Button>
          }
        />
      </div>
    </Modal>
  );
}

export default TheaterSheetModal;
