import { useState } from 'react';
import InlineNotice from '@/components/InlineNotice';
import { Trash2 } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from 'react-redux';

import { useAppDispatch, type RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { waitUntil } from '@/utils/waitUntil';
import { DELETE_PLAN_WORDS } from '@apps/runway/constants';
import {
  deleteRunwayPlan,
  isPhraseTyped,
} from '@apps/runway/store/actions/deletePlanActions';
import { clearRunway, setKeyStatus } from '@apps/runway/store/runwaySlice';

interface DeletePlanScreenProps {
  onClose: () => void;
  onDeleted: () => void;
}

const GONE_WAIT_MS = 5000;

/** Asks for the typed phrase, then deletes; a failed run leaves the screen open to run again. */
function DeletePlanScreen({ onClose, onDeleted }: DeletePlanScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [phrase, setPhrase] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = isPhraseTyped(phrase) && !isBusy;

  const remove = async () => {
    if (!user || !canDelete) return;
    const isConfirmed = await confirm({
      title: DELETE_PLAN_WORDS.confirmTitle,
      message: DELETE_PLAN_WORDS.confirmMessage,
      confirmText: DELETE_PLAN_WORDS.confirmText,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await deleteRunwayPlan(user.uid, phrase);
      // The listeners stay on through the delete so the device's copy drops what the server removed.
      await waitUntil(
        () => {
          const { runway } = store.getState();
          return runway.plan === null && runway.items.length === 0;
        },
        { timeoutMs: GONE_WAIT_MS },
      );
      dispatch(clearRunway());
      dispatch(setKeyStatus('loading'));
      onDeleted();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, DELETE_PLAN_WORDS.partial));
      setIsBusy(false);
    }
  };

  return (
    <Subview overlay title={DELETE_PLAN_WORDS.title} onClose={onClose}>
      <div className='space-y-4'>
        <InlineNotice tone='warning' title={DELETE_PLAN_WORDS.goes}>
          {DELETE_PLAN_WORDS.kept}
        </InlineNotice>
        <div className='space-y-2'>
          <p className='text-muted-foreground block text-xs'>
            {DELETE_PLAN_WORDS.phraseLabel}
          </p>
          <Input
            aria-label={DELETE_PLAN_WORDS.phraseLabel}
            variant='outline'
            value={phrase}
            autoComplete='off'
            autoCapitalize='none'
            spellCheck={false}
            disabled={isBusy}
            onChange={(changeEvent) => setPhrase(changeEvent.target.value)}
          />
        </div>
        {error && (
          <p className='text-destructive text-sm text-pretty' role='alert'>
            {error}
          </p>
        )}
        <Button
          type='button'
          variant='destructive'
          className='w-full gap-2'
          disabled={!canDelete}
          onClick={() => void remove()}
        >
          <Trash2 className='h-4 w-4' aria-hidden='true' />
          <span>{isBusy ? 'Deleting…' : DELETE_PLAN_WORDS.confirmText}</span>
        </Button>
      </div>
    </Subview>
  );
}

export default DeletePlanScreen;
