import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { HELM_COPY } from '@apps/helm/constants';

type HabitsChoice = 'keep' | 'delete';

const OPTIONS: readonly PillOption<HabitsChoice>[] = [
  { value: 'keep', label: HELM_COPY.goalHabitsKeep },
  { value: 'delete', label: HELM_COPY.goalHabitsDelete },
];

interface GoalHabitsChoiceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  habitNames: string[];
  confirmText: string;
  isDestructive: boolean;
  isBusy: boolean;
  onConfirm: (habits: HabitsChoice) => void;
}

function ChoiceBody({
  onClose,
  message,
  habitNames,
  confirmText,
  isDestructive,
  isBusy,
  onConfirm,
}: Omit<GoalHabitsChoiceSheetProps, 'isOpen' | 'title'>) {
  const [choice, setChoice] = useState<HabitsChoice>('keep');

  return (
    <div className='space-y-4'>
      <p className='text-[15px] text-pretty'>{message}</p>
      <p className='text-[15px] text-pretty'>
        {HELM_COPY.goalHabitsChoiceQuestion(habitNames)}
      </p>
      <PillGroup
        label={HELM_COPY.goalHabitsChoiceLabel}
        options={OPTIONS}
        value={choice}
        onChange={setChoice}
      />
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {choice === 'keep'
          ? HELM_COPY.goalHabitsKeepHint
          : HELM_COPY.goalHabitsDeleteHint}
      </p>
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            variant={isDestructive ? 'destructive' : 'primary'}
            loading={isBusy}
            onClick={() => onConfirm(choice)}
          >
            {confirmText}
          </Button>
        }
      />
    </div>
  );
}

/** Asked when a goal with habits is deleted or turned into a project: names the habits and offers keeping them (the default) or deleting them. */
function GoalHabitsChoiceSheet({
  isOpen,
  title,
  ...body
}: GoalHabitsChoiceSheetProps) {
  return (
    <FormSheet isOpen={isOpen} onClose={body.onClose} title={title}>
      {isOpen && <ChoiceBody {...body} />}
    </FormSheet>
  );
}

export default GoalHabitsChoiceSheet;
