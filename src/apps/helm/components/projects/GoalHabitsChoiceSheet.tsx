import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl, {
  type SegmentOption,
} from '@/components/SegmentedControl';
import { HELM_COPY } from '@apps/helm/constants';

type HabitsChoice = 'keep' | 'delete';

const optionsFor = (count: number): readonly SegmentOption<HabitsChoice>[] => [
  { value: 'keep', label: HELM_COPY.goalHabitsKeep(count) },
  { value: 'delete', label: HELM_COPY.goalHabitsDelete(count) },
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
      <div className='space-y-2'>
        <p className='text-sm font-medium break-words'>
          {HELM_COPY.goalHabitsChoiceLabel(habitNames)}
        </p>
        <SegmentedControl
          label={HELM_COPY.goalHabitsChoiceLabel(habitNames)}
          options={optionsFor(habitNames.length)}
          value={choice}
          onChange={setChoice}
        />
      </div>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {choice === 'keep'
          ? HELM_COPY.goalHabitsKeepHint(habitNames.length)
          : HELM_COPY.goalHabitsDeleteHint(habitNames.length)}
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
