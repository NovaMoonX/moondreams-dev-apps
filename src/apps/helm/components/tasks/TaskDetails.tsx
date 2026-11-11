import { useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import AppToggle from '@/components/AppToggle';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import LockedButton from '@/components/LockedButton';
import NotchedSlider from '@/components/NotchedSlider';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import SummaryRow from '@/components/SummaryRow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import {
  CONTEXT_OPTIONS,
  ENERGY_OPTIONS,
  HELM_COPY,
  IMPORTANCE_OPTIONS,
  LENGTH_OPTIONS,
} from '@apps/helm/constants';
import type { WordsResult } from '@apps/helm/store/actions/taskActions';
import type {
  OpenTask,
  TaskDue,
  TaskPlainFields,
  TaskWordsChange,
} from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { formatTaskDue, formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

export type WordsOutcome = WordsResult | 'failed';

/** What a part of the task sheet needs to change the task it shows. */
export interface TaskEditing {
  uid: string;
  task: OpenTask;
  timeZone: string;
  isOffline: boolean;
  /** Writes plain fields at once; a failure is reported by the sheet. */
  saveFields: (fields: TaskPlainFields) => void;
  /** Runs any other write without waiting, reporting a failure. */
  run: (write: Promise<unknown>) => void;
  saveWords: (change: TaskWordsChange) => Promise<WordsOutcome>;
}

const DEFAULT_TIME = '09:00';
const MAX_LENGTH_MINUTES = 1_440;
const FIELD_ROW = 'flex min-h-11 items-center gap-3';
const SMALL_ACTION =
  "text-foreground! relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']";

const toZonedTime = (at: number, timeZone: string) =>
  new Date(at).toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

const toDue = (
  date: string,
  time: string,
  timeZone: string,
): TaskDue | null => {
  const day = fromDateInputValue(date);
  if (day === undefined) return null;
  return time
    ? { kind: 'moment', at: zonedDateTimeToEpoch(date, time, timeZone) }
    : { kind: 'day', date: day };
};

interface WordsEditorProps {
  label: string;
  initial: string;
  isMultiline?: boolean;
  isRequired?: boolean;
  maxLength: number;
  isOffline: boolean;
  /** Turns what was typed into what is saved; null leaves Done unavailable. */
  toValue: (text: string) => string | null;
  onSave: (value: string) => Promise<WordsOutcome>;
  onSaved: (value: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onBack: () => void;
}

const getFailure = (outcome: WordsOutcome) =>
  outcome === 'unreadable'
    ? HELM_COPY.taskWordsUnreadable
    : outcome === 'offline'
      ? HELM_COPY.wordsNeedConnectionBody
      : HELM_COPY.wordsSaveFailed;

/** A words field that saves on its own Done, which needs a connection; what was typed stays when a save fails. */
export function WordsEditor({
  label,
  initial,
  isMultiline = false,
  isRequired = false,
  maxLength,
  isOffline,
  toValue,
  onSave,
  onSaved,
  onDirtyChange,
  onBack,
}: WordsEditorProps) {
  const [text, setText] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const value = toValue(text);
  const requestBack = useDiscardGuard({
    isDirty: text !== initial,
    onClose: onBack,
    isBusy: isSaving,
  });
  const change = (next: string) => {
    setText(next);
    onDirtyChange(next !== initial);
  };
  const canSave =
    !isSaving && (!isRequired || (value !== null && value !== ''));

  const save = async () => {
    if (!canSave || value === null) return;
    setIsSaving(true);
    setFailure(null);
    const outcome = await onSave(value);
    setIsSaving(false);
    if (outcome === 'saved' || outcome === 'missing') {
      onSaved(value);
      return;
    }
    setFailure(getFailure(outcome));
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <BackLink onBack={requestBack} />
        <p className='font-medium'>{label}</p>
      </div>
      {isMultiline ? (
        <Textarea
          variant='outline'
          rows={6}
          aria-label={label}
          className='helm-field'
          maxLength={maxLength}
          value={text}
          onChange={(event) => change(event.target.value)}
        />
      ) : (
        <Input
          variant='outline'
          aria-label={label}
          className='helm-field'
          maxLength={maxLength}
          value={text}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void save();
          }}
        />
      )}
      {failure && (
        <p role='alert' className='text-destructive text-sm text-pretty'>
          {failure}
        </p>
      )}
      {isOffline ? (
        <LockedButton
          label={HELM_COPY.doneEditing}
          title={HELM_COPY.wordsNeedConnectionTitle}
          className='w-full'
        >
          <p>{HELM_COPY.wordsNeedConnectionBody}</p>
        </LockedButton>
      ) : (
        <Button
          type='button'
          className='w-full'
          disabled={!canSave}
          onClick={() => void save()}
        >
          {HELM_COPY.doneEditing}
        </Button>
      )}
    </div>
  );
}

interface WhenRowProps {
  editing: TaskEditing;
  now: number;
}

export function WhenRow({ editing, now }: WhenRowProps) {
  const { task, timeZone, saveFields } = editing;
  const { due } = task;
  const date = due ? toDateInputValue(getDueDay(due, timeZone)) : '';
  const time = due?.kind === 'moment' ? toZonedTime(due.at, timeZone) : '';

  return (
    <SummaryEditor
      isFramed
      shouldFocus={false}
      label={HELM_COPY.whenLabel}
      title={HELM_COPY.whenLabel}
      summary={due ? formatTaskDue(due, timeZone, now) : ''}
      placeholder={HELM_COPY.noDay}
    >
      <DateInput
        variant='outline'
        aria-label={HELM_COPY.whenLabel}
        className='helm-field'
        value={date}
        onChange={(event) =>
          saveFields({ due: toDue(event.target.value, time, timeZone) })
        }
      />
      {due?.kind === 'day' && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() =>
            saveFields({ due: toDue(date, DEFAULT_TIME, timeZone) })
          }
        >
          {HELM_COPY.addTime}
        </Button>
      )}
      {due?.kind === 'moment' && (
        <div className={FIELD_ROW}>
          <Input
            type='time'
            variant='outline'
            aria-label={HELM_COPY.addTime}
            className='helm-field'
            value={time}
            onChange={(event) =>
              saveFields({ due: toDue(date, event.target.value, timeZone) })
            }
          />
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={SMALL_ACTION}
            onClick={() => saveFields({ due: toDue(date, '', timeZone) })}
          >
            {HELM_COPY.removeField}
          </Button>
        </div>
      )}
      {due && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={SMALL_ACTION}
          onClick={() => saveFields({ due: null })}
        >
          {HELM_COPY.clearField}
        </Button>
      )}
    </SummaryEditor>
  );
}

const LENGTH_PILLS: PillOption<string>[] = [
  ...LENGTH_OPTIONS.map((minutes) => ({
    value: String(minutes),
    label: HELM_COPY.lengthValue(minutes),
  })),
  { value: 'other', label: HELM_COPY.lengthOther },
];

function OtherLength({ editing }: { editing: TaskEditing }) {
  const { task, saveFields } = editing;
  const [text, setText] = useState(
    task.durationMinutes !== null &&
      !LENGTH_PILLS.some((pill) => pill.value === String(task.durationMinutes))
      ? String(task.durationMinutes)
      : '',
  );

  return (
    <Input
      type='number'
      inputMode='numeric'
      variant='outline'
      min={1}
      max={MAX_LENGTH_MINUTES}
      aria-label={HELM_COPY.lengthMinutes}
      placeholder={HELM_COPY.lengthMinutes}
      className='helm-field'
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const minutes = Number(event.target.value);
        if (
          Number.isInteger(minutes) &&
          minutes >= 1 &&
          minutes <= MAX_LENGTH_MINUTES
        ) {
          saveFields({ durationMinutes: minutes });
        }
      }}
    />
  );
}

function LengthField({ editing }: { editing: TaskEditing }) {
  const { task, saveFields } = editing;
  const [isOtherOpen, setOtherOpen] = useState(false);
  const minutes = task.durationMinutes;
  const isPreset =
    minutes !== null && LENGTH_OPTIONS.some((option) => option === minutes);
  const selected =
    isOtherOpen || (minutes !== null && !isPreset)
      ? 'other'
      : minutes === null
        ? null
        : String(minutes);

  const choose = (value: string) => {
    if (value === selected) {
      setOtherOpen(false);
      saveFields({ durationMinutes: null });
      return;
    }
    if (value === 'other') {
      setOtherOpen(true);
      return;
    }
    setOtherOpen(false);
    saveFields({ durationMinutes: Number(value) });
  };

  return (
    <div className='space-y-2'>
      <span className='text-muted-foreground block text-xs'>
        {HELM_COPY.lengthLabel}
      </span>
      <PillGroup
        label={HELM_COPY.lengthLabel}
        options={LENGTH_PILLS}
        value={selected}
        onChange={choose}
      />
      {selected === 'other' && <OtherLength editing={editing} />}
    </div>
  );
}

function ImportanceField({ editing }: { editing: TaskEditing }) {
  const { task, saveFields } = editing;
  const options = IMPORTANCE_OPTIONS.map((option) => ({
    ...option,
    ariaLabel: option.label,
  }));

  return (
    <div className='space-y-1'>
      <span className='text-muted-foreground block text-xs'>
        {HELM_COPY.importanceLabel}
      </span>
      {task.importance === null ? (
        <Button
          type='button'
          variant='tertiary'
          className='text-muted-foreground! h-auto min-h-11 justify-start px-0!'
          onClick={() => saveFields({ importance: 'should' })}
        >
          {HELM_COPY.notSet}
        </Button>
      ) : (
        <div className={FIELD_ROW}>
          <NotchedSlider
            label={HELM_COPY.importanceLabel}
            options={options}
            value={task.importance}
            className='w-48'
            onChange={(importance) => saveFields({ importance })}
          />
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={join(SMALL_ACTION, 'ml-auto')}
            onClick={() => saveFields({ importance: null })}
          >
            {HELM_COPY.clearField}
          </Button>
        </div>
      )}
    </div>
  );
}

interface TaskDetailsProps {
  editing: TaskEditing;
  notes: string | null;
  waitsOnSummary: string;
  onOpenNotes: () => void;
  onOpenWaits: () => void;
}

function TaskDetails({
  editing,
  notes,
  waitsOnSummary,
  onOpenNotes,
  onOpenWaits,
}: TaskDetailsProps) {
  const { task, saveFields } = editing;

  return (
    <div className='space-y-4'>
      <ImportanceField editing={editing} />
      <label className={join(FIELD_ROW, 'justify-between')}>
        <span>{HELM_COPY.urgentLabel}</span>
        <AppToggle
          aria-label={HELM_COPY.urgentLabel}
          checked={task.isUrgent}
          onCheckedChange={(isUrgent) => saveFields({ isUrgent })}
        />
      </label>
      <LengthField key={task.id} editing={editing} />
      <div className='space-y-2'>
        <span className='text-muted-foreground block text-xs'>
          {HELM_COPY.energyLabel}
        </span>
        <PillGroup
          label={HELM_COPY.energyLabel}
          options={ENERGY_OPTIONS}
          value={task.energy}
          onChange={(energy) =>
            saveFields({ energy: energy === task.energy ? null : energy })
          }
        />
      </div>
      <div className='space-y-2'>
        <span className='text-muted-foreground block text-xs'>
          {HELM_COPY.contextLabel}
        </span>
        <PillGroup
          label={HELM_COPY.contextLabel}
          options={CONTEXT_OPTIONS}
          value={task.context}
          onChange={(context) =>
            saveFields({ context: context === task.context ? null : context })
          }
        />
      </div>
      <SummaryEditor
        isFramed
        shouldFocus={false}
        label={HELM_COPY.notUntilLabel}
        title={HELM_COPY.notUntilLabel}
        summary={
          task.notUntil === null ? '' : formatWeekdayDayUTC(task.notUntil)
        }
        placeholder={HELM_COPY.noneValue}
      >
        <DateInput
          variant='outline'
          aria-label={HELM_COPY.notUntilLabel}
          className='helm-field'
          value={toDateInputValue(task.notUntil ?? undefined)}
          onChange={(event) =>
            saveFields({
              notUntil: fromDateInputValue(event.target.value) ?? null,
            })
          }
        />
        {task.notUntil !== null && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={SMALL_ACTION}
            onClick={() => saveFields({ notUntil: null })}
          >
            {HELM_COPY.removeField}
          </Button>
        )}
      </SummaryEditor>
      <SummaryRow label={HELM_COPY.waitsOnLabel} onClick={onOpenWaits}>
        {waitsOnSummary}
      </SummaryRow>
      {task.waitsOnWhoId !== null && (
        <div className='flex items-center gap-2'>
          <div className='min-w-0 flex-1'>
            <SummaryRow label={HELM_COPY.waitsOnLabel}>
              {HELM_COPY.someone}
            </SummaryRow>
          </div>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={SMALL_ACTION}
            onClick={() => saveFields({ waitsOnWhoId: null })}
          >
            {HELM_COPY.removeField}
          </Button>
        </div>
      )}
      {!task.isUnreadable && (
        <SummaryRow label={HELM_COPY.notesLabel} onClick={onOpenNotes}>
          {notes ? (
            <span className='line-clamp-3 whitespace-pre-line'>{notes}</span>
          ) : (
            <span className='text-muted-foreground'>{HELM_COPY.noneValue}</span>
          )}
        </SummaryRow>
      )}
    </div>
  );
}

export default TaskDetails;
