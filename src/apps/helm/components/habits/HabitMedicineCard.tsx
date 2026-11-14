import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import {
  HELM_COPY,
  MEDICINE_DOSE_MAX,
  MEDICINE_NAME_MAX,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { setHabitMedicine } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit } from '@apps/helm/types';

/** Asks "Which medicine is it?" once for a care habit with no medicine; Save or Not now both end the question for good. */
function HabitMedicineCard({ habit }: { habit: OpenHabit }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistantName = useAssistantName();
  const fieldId = useId();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  if (habit.medicine !== null || habit.medicineAskedAt !== null) return null;

  const answer = async (medicine: OpenHabit['medicine']) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      const result = await setHabitMedicine(
        user.uid,
        await getHelmEncryption(user.uid),
        habit.id,
        medicine,
      );
      if (result === 'saved') return;
      addToast({
        title:
          result === 'offline'
            ? HELM_COPY.habitEditNeedsConnection
            : result === 'missing'
              ? HELM_COPY.habitGone
              : HELM_COPY.habitUnreadable,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm habit medicine did not save', error);
      addToast({ title: HELM_COPY.habitMedicineFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <section className='helm-card space-y-3 px-4 py-3'>
      <div>
        <p className='text-foreground text-[15px] leading-[21px]'>
          {HELM_COPY.habitMedicineQuestion}
        </p>
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.habitMedicineHelp(assistantName)}
        </p>
      </div>
      <div className='flex items-start gap-3'>
        <Input
          id={`${fieldId}-medicine`}
          className='min-w-0 flex-[2]'
          aria-label={HELM_COPY.habitMedicineField}
          value={name}
          maxLength={MEDICINE_NAME_MAX}
          placeholder={HELM_COPY.habitMedicinePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          className='min-w-0 flex-1'
          aria-label={HELM_COPY.habitDoseField}
          value={dose}
          maxLength={MEDICINE_DOSE_MAX}
          placeholder={HELM_COPY.habitDosePlaceholder}
          onChange={(event) => setDose(event.target.value)}
        />
      </div>
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='tertiary'
          disabled={isSaving}
          onClick={() => void answer(null)}
        >
          {HELM_COPY.habitMedicineNotNow}
        </Button>
        <Button
          type='button'
          loading={isSaving}
          disabled={name.trim() === ''}
          onClick={() => void answer({ name, dose: dose.trim() || null })}
        >
          {HELM_COPY.habitMedicineSave}
        </Button>
      </div>
    </section>
  );
}

export default HabitMedicineCard;
