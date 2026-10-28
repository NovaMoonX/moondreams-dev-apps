import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from 'react-redux';

import { useAppDispatch, type RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
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

const GONE_POLL_MS = 100;
const GONE_WAIT_MS = 5000;

/** The listeners stay on through the delete so the device's own copy drops what the server removed, and are stopped once they report it gone. */
async function waitUntilGone(getState: () => RootState) {
  const deadline = Date.now() + GONE_WAIT_MS;
  const isGone = () => {
    const { runway } = getState();
    return (
      runway.plan === null &&
      runway.items.length === 0 &&
      runway.days.length === 0
    );
  };
  while (!isGone() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, GONE_POLL_MS));
  }
}

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
      await waitUntilGone(store.getState);
      dispatch(clearRunway());
      dispatch(setKeyStatus('loading'));
      onDeleted();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, DELETE_PLAN_WORDS.partial));
      setIsBusy(false);
    }
  };

  return (
    <Subview title={DELETE_PLAN_WORDS.title} onClose={onClose}>
      <div className='space-y-4'>
        <div className='border-border bg-card space-y-3 rounded-2xl border p-4'>
          <p className='text-sm font-medium text-pretty'>
            {DELETE_PLAN_WORDS.goes}
          </p>
          <p className='text-muted-foreground text-sm text-pretty'>
            {DELETE_PLAN_WORDS.keys}
          </p>
          <p className='text-muted-foreground text-sm text-pretty'>
            {DELETE_PLAN_WORDS.kept}
          </p>
        </div>
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
