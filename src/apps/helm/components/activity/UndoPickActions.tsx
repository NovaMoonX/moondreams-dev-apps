import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenExecution } from '@apps/helm/types';
import type { UndoUnit } from '@apps/helm/utils/undoUnits';

interface UndoPickActionsProps {
  execution: OpenExecution;
  /** The units still left to take back. */
  units: UndoUnit[];
  /** The keys of the ones ticked. */
  picked: Set<string>;
  isBusyChange: (isBusy: boolean) => void;
  onCancel: () => void;
  /** Called once the units are taken back, or the execution no longer has any to take. */
  onDone: () => void;
}

/** Cancel and the confirm of a partial undo; a refusal shows above them and the list stays open. */
function UndoPickActions({
  execution,
  units,
  picked,
  isBusyChange,
  onCancel,
  onDone,
}: UndoPickActionsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const chosen = units.filter((unit) => picked.has(unit.key));
  const label =
    chosen.length === units.length
      ? HELM_COPY.undoPickAll
      : HELM_COPY.undoPickSome(chosen.length);

  const run = async () => {
    if (!user || isWorking || chosen.length === 0) return;
    setIsWorking(true);
    isBusyChange(true);
    setRefusal(null);
    try {
      const result = await takeBack(user.uid, execution.id, {
        docIds: [...new Set(chosen.flatMap((unit) => unit.docIds))],
        reason: { reason: 'unclear', quote: null, via: 'card' },
      });
      if (result.kind === 'done') onDone();
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
      isBusyChange(false);
    }
  };

  return (
    <ModalFooterActions
      note={
        refusal ?? (chosen.length === 0 ? HELM_COPY.undoPickNone : undefined)
      }
      cancelAction={
        <Button
          type='button'
          variant='tertiary'
          disabled={isWorking}
          onClick={onCancel}
        >
          {HELM_COPY.undoPickCancel}
        </Button>
      }
      rightActions={
        <Button
          type='button'
          variant='primary'
          className='whitespace-nowrap'
          disabled={isWorking || chosen.length === 0}
          onClick={run}
        >
          {label}
        </Button>
      }
    />
  );
}

export default UndoPickActions;
