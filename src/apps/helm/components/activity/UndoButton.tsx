import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import LockedButton from '@/components/LockedButton';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HELM_COPY } from '@apps/helm/constants';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenExecution } from '@apps/helm/types';

interface UndoButtonProps {
  execution: OpenExecution;
  /** How many changes the card lists: "Undo all of this" from two. */
  lineCount: number;
  /** The sheet's one action: a full-width primary button; cards keep the small secondary. */
  isFull?: boolean;
}

/** Takes an execution back. It works alone: nothing else on the surface is locked while it runs. */
function UndoButton({ execution, lineCount, isFull }: UndoButtonProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOffline = useNetworkStatus() === 'offline';
  const [isWorking, setIsWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const label = lineCount > 1 ? HELM_COPY.undoAll : HELM_COPY.undo;

  if (refusal !== null) {
    return (
      <p
        className={join(
          'text-muted-foreground text-[13px] text-pretty',
          isFull && 'py-2.5',
        )}
      >
        {refusal}
      </p>
    );
  }
  if (!canUndo(execution)) return null;
  if (isOffline) {
    return (
      <LockedButton
        label={label}
        title={HELM_COPY.undoNeedsConnectionTitle}
        size={isFull ? undefined : 'sm'}
        className={isFull ? 'w-full' : undefined}
      >
        <p>{HELM_COPY.undoNeedsConnectionBody}</p>
      </LockedButton>
    );
  }

  const run = async () => {
    if (!user || isWorking) return;
    setIsWorking(true);
    try {
      const result = await takeBack(user.uid, execution.id);
      if (result.kind === 'refused') {
        setRefusal(result.report ?? HELM_COPY.cannotTakeBack);
      }
      if (result.kind === 'offline') {
        addToast({
          title: HELM_COPY.undoNeedsConnectionTitle,
          description: HELM_COPY.undoNeedsConnectionBody,
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Helm undo failed', error);
      addToast({ title: HELM_COPY.undoFailed, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Button
      type='button'
      variant={isFull ? 'primary' : 'secondary'}
      size={isFull ? undefined : 'sm'}
      className={join('whitespace-nowrap', isFull && 'w-full')}
      disabled={isWorking}
      onClick={run}
    >
      {label}
    </Button>
  );
}

export default UndoButton;
