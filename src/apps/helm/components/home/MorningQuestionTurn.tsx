import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';
import type { useDayCard } from '@apps/helm/hooks/useDayCard';
import {
  bringAimToToday,
  setMorningState,
  type DayAimsChange,
} from '@apps/helm/store/actions/dayAimsActions';
import { formatAimLength } from '@apps/helm/utils/dayCard';

/** The morning question as the assistant's turn: what the person wants done today, with yesterday's leftovers as choices to pick several of. Anything said in the composer while it is live answers it too, through the same turn path. */
function MorningQuestionTurn({
  card,
}: {
  card: ReturnType<typeof useDayCard>;
}) {
  const { addToast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const { uid, model } = card;
  if (!uid || !model) return null;
  const { carry, todayKey, yesterdayKey } = model;

  const toggle = (taskId: string) =>
    setPicked((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  const add = async () => {
    if (picked.length === 0 || isBusy) return;
    setIsBusy(true);
    try {
      const changes: DayAimsChange[] = await Promise.all(
        carry
          .filter((row) => picked.includes(row.taskId))
          .map((row) =>
            bringAimToToday(uid, {
              todayKey,
              fromKey: yesterdayKey,
              taskId: row.taskId,
              hasLength: row.minutes !== null,
            }),
          ),
      );
      const answered = await setMorningState(uid, todayKey, 'answered');
      await Promise.all([...changes, answered].map((change) => change.write));
      addToast({
        title: HELM_COPY.dayAimsAdded(changes.length),
        type: 'info',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void Promise.all(
              [answered, ...changes].map((change) => change.undo()),
            ).catch(() =>
              addToast({ title: HELM_COPY.dayAimsSaveFailed, type: 'error' }),
            ),
        },
      });
      setPicked([]);
    } catch (error) {
      console.error('Helm morning picks did not save', error);
      addToast({ title: HELM_COPY.dayAimsSaveFailed, type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className='flex w-full flex-col items-start gap-2'>
      <AssistantLine>{HELM_COPY.dayAimsQuestion}</AssistantLine>
      <div className='ml-[30px] flex w-[calc(100%-30px)] flex-col gap-2'>
        {carry.length > 0 && (
          <>
            <ChoiceGroup label={HELM_COPY.dayAimsFromYesterday} kind='checkbox'>
              {carry.map((row) => (
                <ChoiceRow
                  key={row.taskId}
                  kind='checkbox'
                  label={row.title}
                  detail={
                    row.minutes === null ? null : formatAimLength(row.minutes)
                  }
                  isSelected={picked.includes(row.taskId)}
                  isDisabled={isBusy}
                  onClick={() => toggle(row.taskId)}
                />
              ))}
            </ChoiceGroup>
            <Button
              type='button'
              className='self-end'
              disabled={isBusy || picked.length === 0}
              onClick={() => void add()}
            >
              {HELM_COPY.dayAimsPicked(picked.length)}
            </Button>
          </>
        )}
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.dayAimsOrSayIt}
        </p>
      </div>
    </div>
  );
}

export default MorningQuestionTurn;
