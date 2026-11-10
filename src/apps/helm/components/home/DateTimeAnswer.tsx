import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { HELM_COPY } from '@apps/helm/constants';

/** A day, a time or both, by the question's mode; Send waits until every field it asks for is filled. */
function DateTimeAnswer({ question, isBusy, skip, onAnswer }: AnswerPartProps) {
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const mode = question.dateMode ?? 'dateTime';
  const needsDay = mode !== 'time';
  const needsTime = mode !== 'date';
  const date = needsDay ? (fromDateInputValue(day) ?? null) : null;
  const canSend =
    !isBusy &&
    (!needsDay || date !== null) &&
    (!needsTime || /^\d{2}:\d{2}$/.test(time));

  return (
    <div className='flex w-full flex-col items-stretch gap-2'>
      <div className='flex flex-wrap gap-2'>
        {needsDay && (
          <DateInput
            variant='outline'
            aria-label={HELM_COPY.questionDateLabel}
            wrapperClassName='min-w-40 flex-1'
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        )}
        {needsTime && (
          <Input
            type='time'
            variant='outline'
            aria-label={HELM_COPY.questionTimeLabel}
            className='helm-field min-w-32'
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        )}
      </div>
      <div className='flex items-center justify-between gap-3'>
        {skip}
        <Button
          type='button'
          variant='primary'
          className='ml-auto'
          disabled={!canSend}
          onClick={() =>
            onAnswer({
              shape: 'dateTime',
              date,
              time: needsTime ? time : null,
            })
          }
        >
          {HELM_COPY.questionSend}
        </Button>
      </div>
    </div>
  );
}

export default DateTimeAnswer;
