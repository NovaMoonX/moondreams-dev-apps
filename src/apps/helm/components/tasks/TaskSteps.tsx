import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import BackLink from '@/components/BackLink';
import EllipsisDropdown from '@/components/EllipsisDropdown';
import LockedButton from '@/components/LockedButton';
import TickMark from '@/components/TickMark';
import { HELM_COPY, STEP_LIMIT, TASK_TITLE_CAP } from '@apps/helm/constants';
import {
  moveTaskStep,
  tickTaskStep,
} from '@apps/helm/store/actions/taskActions';
import { toTaskTitle } from '@apps/helm/utils/heldCaptures';
import {
  getOrderedSteps,
  getSwapOrders,
  newStepId,
} from '@apps/helm/utils/taskEdits';
import type { TaskEditing, WordsOutcome } from './TaskDetails';

const { option } = DropdownMenuFactories;

interface TickButtonProps {
  isDone: boolean;
  label: string;
  onClick: () => void;
}

export function TickButton({ isDone, label, onClick }: TickButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='icon'
      aria-label={label}
      onClick={onClick}
      className="relative size-10 min-w-10 shrink-0 p-0 before:absolute before:-inset-0.5 before:content-['']"
    >
      {isDone ? (
        <TickMark className='text-xl' />
      ) : (
        <span
          aria-hidden='true'
          className='border-muted-foreground/60 size-[23px] rounded-full border-2'
        />
      )}
    </Button>
  );
}

interface TaskStepsProps {
  editing: TaskEditing;
  onEdit: (stepId: string) => void;
  onBack: () => void;
}

/** The task's steps: each ticked on its own, moved, edited or removed from its menu, with a field at the foot to add one. */
function TaskSteps({ editing, onEdit, onBack }: TaskStepsProps) {
  const { task, uid, isOffline, run, saveWords } = editing;
  const { addToast } = useToast();
  const steps = getOrderedSteps(task);
  const doneCount = steps.filter((step) => step.doneAt !== null).length;
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reportWords = (outcome: WordsOutcome) => {
    if (outcome === 'saved' || outcome === 'missing') return;
    addToast({
      title:
        outcome === 'offline'
          ? HELM_COPY.wordsNeedConnectionTitle
          : outcome === 'unreadable'
            ? HELM_COPY.taskWordsUnreadable
            : HELM_COPY.wordsSaveFailed,
      description:
        outcome === 'offline' ? HELM_COPY.wordsNeedConnectionBody : undefined,
      type: 'error',
    });
  };

  const add = async () => {
    const text = toTaskTitle(draft);
    if (!text || isAdding || isOffline) return;
    setIsAdding(true);
    setFailure(null);
    const outcome = await saveWords({
      kind: 'addStep',
      stepId: newStepId(),
      text,
    });
    setIsAdding(false);
    if (outcome === 'saved') {
      setDraft('');
      return;
    }
    setFailure(
      outcome === 'offline'
        ? HELM_COPY.wordsNeedConnectionBody
        : outcome === 'unreadable'
          ? HELM_COPY.taskWordsUnreadable
          : HELM_COPY.wordsSaveFailed,
    );
  };

  const choose = (stepId: string, value: string) => {
    if (value === 'edit') {
      if (isOffline) {
        reportWords('offline');
        return;
      }
      onEdit(stepId);
      return;
    }
    if (value === 'remove') {
      if (isOffline) {
        reportWords('offline');
        return;
      }
      void saveWords({ kind: 'removeStep', stepId }).then(reportWords);
      return;
    }
    const orders = getSwapOrders(steps, stepId, value === 'up' ? 'up' : 'down');
    if (orders) run(moveTaskStep(uid, task.id, orders));
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <BackLink onBack={onBack} />
        <p className='font-medium'>
          {HELM_COPY.stepsLabel}
          {steps.length > 0 && (
            <span className='text-muted-foreground font-normal tabular-nums'>
              {' · '}
              {HELM_COPY.stepsCount(doneCount, steps.length)}
            </span>
          )}
        </p>
      </div>
      {steps.length > 0 && (
        <ul className='divide-border divide-y'>
          {steps.map((step, index) => {
            const isDone = step.doneAt !== null;
            return (
              <li key={step.id} className='flex min-h-12 items-center gap-1'>
                <TickButton
                  isDone={isDone}
                  label={
                    isDone
                      ? HELM_COPY.markNotDone(step.text)
                      : HELM_COPY.markDone(step.text)
                  }
                  onClick={() =>
                    run(
                      tickTaskStep(
                        uid,
                        task.id,
                        step.id,
                        isDone ? null : Date.now(),
                      ),
                    )
                  }
                />
                <span
                  className={join(
                    'min-w-0 flex-1 py-2 break-words',
                    isDone && 'text-muted-foreground line-through',
                  )}
                >
                  {step.text}
                </span>
                <EllipsisDropdown
                  variant='tertiary'
                  ariaLabel={HELM_COPY.stepActions(step.text)}
                  className="relative before:absolute before:-inset-1 before:content-['']"
                  items={[
                    option({ label: HELM_COPY.editStep, value: 'edit' }),
                    ...(index > 0
                      ? [option({ label: HELM_COPY.moveUp, value: 'up' })]
                      : []),
                    ...(index < steps.length - 1
                      ? [option({ label: HELM_COPY.moveDown, value: 'down' })]
                      : []),
                    option({ label: HELM_COPY.removeField, value: 'remove' }),
                  ]}
                  onItemSelect={(value) => choose(step.id, value)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {steps.length >= STEP_LIMIT ? (
        <p className='text-muted-foreground text-sm'>{HELM_COPY.stepsFull}</p>
      ) : (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Input
              variant='outline'
              aria-label={HELM_COPY.addStep}
              placeholder={HELM_COPY.stepPlaceholder}
              className='helm-field'
              maxLength={TASK_TITLE_CAP}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void add();
              }}
            />
            {isOffline ? (
              <LockedButton
                label={HELM_COPY.addStep}
                title={HELM_COPY.wordsNeedConnectionTitle}
                className='shrink-0 whitespace-nowrap'
              >
                <p>{HELM_COPY.wordsNeedConnectionBody}</p>
              </LockedButton>
            ) : (
              <Button
                type='button'
                variant='secondary'
                className='shrink-0 whitespace-nowrap'
                disabled={isAdding || toTaskTitle(draft) === ''}
                onClick={() => void add()}
              >
                {HELM_COPY.addStep}
              </Button>
            )}
          </div>
          {failure && (
            <p role='alert' className='text-destructive text-sm text-pretty'>
              {failure}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskSteps;
