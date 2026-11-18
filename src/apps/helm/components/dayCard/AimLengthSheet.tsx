import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { HELM_COPY } from '@apps/helm/constants';
import { formatAimLength } from '@apps/helm/utils/dayCard';

const LENGTHS = [15, 30, 45, 60, 90, 120, 180].map((minutes) => ({
  value: String(minutes),
  label: formatAimLength(minutes),
}));

interface AimLengthSheetProps {
  title: string;
  /** The length the planner guessed, preselected so a tap on Save keeps it. */
  guessedMinutes: number;
  onSave: (minutes: number) => Promise<void>;
  onClose: () => void;
}

/** How long a guessed aim takes: a few lengths to pick from, written to the task. */
function AimLengthSheet({
  title,
  guessedMinutes,
  onSave,
  onClose,
}: AimLengthSheetProps) {
  const [value, setValue] = useState(String(guessedMinutes));
  const [isSaving, setIsSaving] = useState(false);
  const save = async () => {
    setIsSaving(true);
    await onSave(Number(value));
    setIsSaving(false);
    onClose();
  };
  return (
    <FormSheet isOpen onClose={onClose} title={HELM_COPY.dayAimsLengthTitle}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>{title}</p>
        <PillGroup
          label={HELM_COPY.dayAimsLengthTitle}
          options={LENGTHS}
          value={value}
          onChange={setValue}
        />
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              onClick={onClose}
              disabled={isSaving}
            >
              {HELM_COPY.editCancel}
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              onClick={() => void save()}
            >
              {HELM_COPY.editSave}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default AimLengthSheet;
