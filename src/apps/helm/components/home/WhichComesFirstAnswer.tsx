import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import { formatDateShort, formatTime, toDayOrdinal } from '@/utils/formatUtils';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { HELM_COPY } from '@apps/helm/constants';
import { useImportanceToday } from '@apps/helm/hooks/useImportancePlace';
import { selectImportanceGroups } from '@apps/helm/store/selectors/importanceSelectors';

const isSameDay = (instant: number) =>
  new Date(instant).toDateString() === new Date().toDateString();

/** "Which comes first?": tall choices, each its emoji, name and the place it holds now; a pick puts it first and the others share what comes after. */
function WhichComesFirstAnswer({
  question,
  isBusy,
  onAnswer,
}: AnswerPartProps) {
  const today = useImportanceToday();
  const groups = useAppSelector((state) =>
    selectImportanceGroups(state, today),
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const rowOf = (id: string) =>
    [...groups.inOrder, ...groups.notSaid, ...groups.canWait].find(
      (row) => row.id === id,
    );
  const isTop = question.options.every(
    (option) => rowOf(option.id)?.position === 1,
  );

  const placeNow = (id: string) => {
    const row = rowOf(id);
    if (!row?.place || row.position === null) return null;
    const { saidAt } = row.place;
    const when = isSameDay(saidAt)
      ? formatTime(saidAt)
      : formatDateShort(saidAt);
    return row.position === 1
      ? HELM_COPY.importanceWhichFirstSince(when)
      : HELM_COPY.importanceWhichPlaceSince(toDayOrdinal(row.position), when);
  };

  return (
    <div className='space-y-2'>
      {isTop && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {question.options.length === 3
            ? HELM_COPY.importanceWhichRest
            : HELM_COPY.importanceWhichRestMany}
        </p>
      )}
      <div
        role='radiogroup'
        aria-label={question.prompt}
        className='flex flex-col gap-2'
      >
        {question.options.map((option) => {
          const detail = placeNow(option.id);
          const emoji = rowOf(option.id)?.emoji ?? null;
          return (
            <Button
              key={option.id}
              type='button'
              variant='base'
              role='radio'
              aria-checked={isBusy && chosenId === option.id}
              disabled={isBusy}
              className={join(
                'helm-card focus-visible:outline-primary flex h-auto min-h-16 w-full items-center justify-start gap-3 px-4 py-3 text-left font-normal transition-none focus-visible:outline-2 focus-visible:-outline-offset-2',
                isBusy && chosenId === option.id && 'border-primary',
              )}
              onClick={() => {
                setChosenId(option.id);
                onAnswer({
                  shape: 'pickOne',
                  optionId: option.id,
                  otherText: null,
                });
              }}
            >
              {emoji && (
                <span
                  className='w-7 shrink-0 text-center text-2xl'
                  aria-hidden='true'
                >
                  {emoji}
                </span>
              )}
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block text-[15px] leading-[21px] font-medium break-words'>
                  {option.label}
                </span>
                {detail && (
                  <span className='text-muted-foreground block text-[13px]'>
                    {detail}
                  </span>
                )}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default WhichComesFirstAnswer;
