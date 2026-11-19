import { useId, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RepeatPicker from '@/components/RepeatPicker';
import SayWhenField from '@/components/SayWhenField';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useRepeatPicker } from '@/hooks/useRepeatPicker';
import { useAppSelector } from '@/store';
import {
  localeWeekStart,
  parseRepeatRule,
  sameRepeatRule,
  type RepeatRule,
} from '@/utils/repeatRule';
import RadioRows from '@apps/helm/components/scheduled/RadioRows';
import { useScheduledChange } from '@apps/helm/components/scheduled/useScheduledChange';
import { HELM_COPY } from '@apps/helm/constants';
import { readMoveRange, toDayKeyIn } from '@apps/helm/engine/scheduledActions';
import {
  changeScheduledAction,
  changeScheduledWords,
  createScheduledAction,
  moveScheduledRun,
  toActionState,
} from '@apps/helm/store/actions/scheduledActionWrites';
import type { OpenScheduledAction } from '@apps/helm/types';
import { readScheduleWords } from '@apps/helm/utils/sayWhen';
import {
  formatClockWords,
  formatRunDay,
  readActionZone,
} from '@apps/helm/utils/scheduledWords';

const TITLE_CAP = 80;
const INSTRUCTION_CAP = 400;
const DEFAULT_TIME = '09:00';

type Scope = 'following' | 'one';

interface ScheduledFormProps {
  onClose: () => void;
  /** The action being changed; null makes a new one. */
  action: OpenScheduledAction | null;
  /** The run Change was opened from; null changes this and the ones after from the next run. */
  runKey: string | null;
  /** The id of an action just made, or null for a change. */
  onSaved?: (createdId: string | null) => void;
}

/** A rule that stops after one run, for "Does not repeat" chosen on an action that repeats. */
const toSingleRule = (repeat: string | null): RepeatRule | null => {
  const old = repeat ? parseRepeatRule(repeat) : null;
  return old ? { ...old, count: 1, until: null } : null;
};

/** The form for making an action by hand and for changing one: its words, when it runs (the shared repeat picker) and, from a run, whether this is just that run or it and the ones after. Nothing is saved until Save. */
function ScheduledForm({
  onClose,
  action,
  runKey,
  onSaved,
}: ScheduledFormProps) {
  const { user } = useAuth();
  const fieldId = useId();
  const now = useNow(60_000);
  const { guard, report } = useScheduledChange();
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const homeZone = profileZone ?? 'UTC';
  const zone = action ? readActionZone(action, homeZone) : homeZone;
  const today = toDayKeyIn(now, zone);
  const state = action ? toActionState(action) : null;
  const targetKey = action ? (runKey ?? action.nextRunKey) : null;
  const moved = targetKey && action ? action.moved[targetKey] : undefined;
  const oldRule = action?.repeat ? parseRepeatRule(action.repeat) : null;

  const [title, setTitle] = useState(action?.title ?? '');
  const [instruction, setInstruction] = useState(action?.instruction ?? '');
  const [scope, setScope] = useState<Scope>('following');
  const [rule, setRule] = useState<RepeatRule | null>(oldRule);
  const [time, setTime] = useState(
    action ? (moved?.time ?? action.time) : DEFAULT_TIME,
  );
  const [day, setDay] = useState(
    action ? (moved?.day ?? targetKey ?? today) : today,
  );
  const [isSaving, setIsSaving] = useState(false);

  const isCreate = action === null;
  const isOne = !isCreate && runKey !== null && scope === 'one';
  const isCommands = action?.kind === 'commands';
  const pickerStart = isCreate ? day : (targetKey ?? today);
  const picker = useRepeatPicker({
    startsOn: pickerStart,
    time,
    value: rule,
    onChange: setRule,
    backLabel: isCreate
      ? HELM_COPY.scheduledFormNewTitle
      : HELM_COPY.scheduledFormChangeBack(action.title),
    weekStart: localeWeekStart(),
    timeFormat: formatClockWords,
    label: HELM_COPY.scheduledHowOften,
  });

  const range =
    action && state && targetKey && isOne
      ? readMoveRange(state, homeZone, {
          key: targetKey,
          now,
          lastRunDay:
            action.lastRunDueAt === null
              ? null
              : toDayKeyIn(action.lastRunDueAt, zone),
        })
      : null;

  const isRuleChanged = !isCreate && !isOne && !sameRepeatRule(rule, oldRule);
  const isTimeChanged = !isCreate && time !== (moved?.time ?? action.time);
  const isWordsChanged =
    !isCreate &&
    !isOne &&
    (title.trim() !== action.title ||
      (!isCommands && (instruction.trim() || null) !== action.instruction));
  const isDayChanged = isOne && day !== (moved?.day ?? targetKey);
  const isDirty = isCreate
    ? title !== '' || instruction !== '' || rule !== null
    : isRuleChanged || isTimeChanged || isWordsChanged || isDayChanged;
  const hasWords =
    isOne || (title.trim() !== '' && (isCommands || instruction.trim() !== ''));
  const isDayValid =
    !isOne ||
    range === null ||
    (day >= range.earliest && (range.latest === null || day <= range.latest));
  const clockNow = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zone,
  }).format(now);
  const isPast =
    isCreate &&
    rule === null &&
    day === today &&
    time !== '' &&
    time <= clockNow;
  const canSave =
    hasWords && isDayValid && !isPast && time !== '' && day !== '';

  const requestClose = useDiscardGuard({
    isDirty,
    isBusy: isSaving,
    onClose,
  });

  const save = () => {
    if (!user || isSaving || !canSave) return;
    setIsSaving(true);
    const finish = (createdId: string | null) => {
      setIsSaving(false);
      onSaved?.(createdId);
      onClose();
    };
    if (isCreate) {
      const made = createScheduledAction(user.uid, {
        title,
        instruction,
        rule,
        startsOn: day,
        time,
      });
      if ('refused' in made) {
        guard(made);
        setIsSaving(false);
        return;
      }
      report(
        {
          written: made.written,
          undo: async () => {
            await made.undo();
            return 'undone';
          },
          createdId: made.createdId,
          dropped: 0,
        },
        HELM_COPY.scheduledMade(title.trim()),
      );
      finish(made.createdId);
      return;
    }
    if (!action) return;
    const editedWords = {
      title: title.trim(),
      instruction: isCommands ? action.instruction : instruction.trim(),
    };
    const changes = [
      ...(isOne && targetKey && isDayChanged
        ? [
            moveScheduledRun(user.uid, action.id, {
              key: targetKey,
              day,
              time: isTimeChanged ? time : null,
            }),
          ]
        : isOne && targetKey && isTimeChanged
          ? [
              moveScheduledRun(user.uid, action.id, {
                key: targetKey,
                day: moved?.day ?? targetKey,
                time,
              }),
            ]
          : []),
      ...(!isOne && (isRuleChanged || isTimeChanged)
        ? [
            changeScheduledAction(
              user.uid,
              action.id,
              {
                kind: 'following',
                fromKey: runKey,
                rule: isRuleChanged
                  ? (rule ?? toSingleRule(action.repeat))
                  : null,
                time: isTimeChanged ? time : null,
              },
              { words: isWordsChanged ? editedWords : undefined },
            ),
          ]
        : []),
    ];
    const refused = changes.find((change) => 'refused' in change);
    if (refused) {
      guard(refused);
      setIsSaving(false);
      return;
    }
    const writes = changes.map((change) => guard(change));
    const isSplit = changes.some(
      (change) => 'createdId' in change && change.createdId !== null,
    );
    const wordsWrite =
      isWordsChanged && !isSplit
        ? guard(changeScheduledWords(user.uid, action.id, editedWords))
        : null;
    const kept = [...writes, wordsWrite].flatMap((write) => write ?? []);
    const dropped = kept.reduce((total, write) => total + write.dropped, 0);
    if (kept.length > 0) {
      const message = HELM_COPY.scheduledChanged(action.title);
      report(
        {
          written: Promise.all(kept.map((write) => write.written)).then(
            () => undefined,
          ),
          undo: async () => {
            const outcomes = await Promise.all(
              [...kept].reverse().map((write) => write.undo()),
            );
            return outcomes.every((outcome) => outcome === 'undone')
              ? 'undone'
              : 'kept';
          },
          createdId: kept.find((write) => write.createdId)?.createdId ?? null,
          dropped,
        },
        message,
      );
    }
    finish(null);
  };

  const rows = [
    {
      value: 'one' as const,
      label: HELM_COPY.scheduledScopeOne,
      subtitle: targetKey
        ? HELM_COPY.scheduledScopeOneSubtitle(formatRunDay(targetKey))
        : undefined,
    },
    {
      value: 'following' as const,
      label: HELM_COPY.scheduledScopeFollowing,
      subtitle: targetKey
        ? HELM_COPY.scheduledScopeFollowingSubtitle(formatRunDay(targetKey))
        : undefined,
    },
  ];

  const appliesDay = isCreate || isOne;
  const appliesRule = !isOne;
  const sayWhenKey = (
    nextTime: string,
    nextDay: string,
    nextRule: typeof rule,
  ) => JSON.stringify([nextTime, nextDay, nextRule]);
  const sayWhen = (text: string) => {
    const read = readScheduleWords(
      text,
      { now: Date.now(), zone },
      { appliesDay, appliesRule },
    );
    if (!read) return null;
    const { schedule, words } = read;
    const nextTime = schedule.time ?? time;
    const nextDay = appliesDay && schedule.startsOn ? schedule.startsOn : day;
    const nextRule = appliesRule && schedule.rule ? schedule.rule : rule;
    setTime(nextTime);
    setDay(nextDay);
    setRule(nextRule);
    return { words, key: sayWhenKey(nextTime, nextDay, nextRule) };
  };

  const form = (
    <div className='space-y-4'>
      <SayWhenField
        label={HELM_COPY.sayWhenLabel}
        placeholder={HELM_COPY.sayWhenScheduledPlaceholder}
        unreadLine={HELM_COPY.sayWhenUnread}
        className='helm-field'
        onRead={sayWhen}
        currentKey={sayWhenKey(time, day, rule)}
      />
      {runKey !== null && (
        <RadioRows rows={rows} value={scope} onChange={setScope} />
      )}
      {!isOne && (
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-title`} className='text-sm font-medium'>
            {HELM_COPY.scheduledNameLabel}
          </label>
          <Input
            id={`${fieldId}-title`}
            value={title}
            maxLength={TITLE_CAP}
            autoFocus={isCreate}
            placeholder={HELM_COPY.scheduledNamePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      )}
      {!isCommands && !isOne && (
        <div className='space-y-1.5'>
          <label
            htmlFor={`${fieldId}-instruction`}
            className='text-sm font-medium'
          >
            {HELM_COPY.scheduledWhatLabel}
          </label>
          <Textarea
            id={`${fieldId}-instruction`}
            variant='outline'
            rows={3}
            autoExpand
            value={instruction}
            maxLength={INSTRUCTION_CAP}
            placeholder={HELM_COPY.scheduledWhatPlaceholder}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
      )}
      {(isCreate || isOne) && (
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-day`} className='text-sm font-medium'>
            {isCreate
              ? HELM_COPY.scheduledFirstDayLabel
              : HELM_COPY.scheduledDayLabel}
          </label>
          <DateInput
            id={`${fieldId}-day`}
            value={day}
            min={isOne ? (range?.earliest ?? today) : today}
            max={isOne ? (range?.latest ?? undefined) : undefined}
            onChange={(event) => setDay(event.target.value)}
          />
          {isOne && range && (
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {range.latest
                ? HELM_COPY.scheduledMoveRange(
                    formatRunDay(range.earliest),
                    formatRunDay(range.latest),
                  )
                : HELM_COPY.scheduledMoveFrom(formatRunDay(range.earliest))}
            </p>
          )}
        </div>
      )}
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-time`} className='text-sm font-medium'>
          {HELM_COPY.scheduledTimeLabel}
        </label>
        <Input
          id={`${fieldId}-time`}
          type='time'
          variant='outline'
          className='helm-field'
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        {isPast && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.scheduledTimePassed(formatClockWords(time))}
          </p>
        )}
      </div>
      {!isOne && <RepeatPicker picker={picker} />}
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={requestClose}>
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={!canSave || isSaving || (!isCreate && !isDirty)}
            onClick={save}
          >
            {isCreate ? HELM_COPY.scheduledMake : HELM_COPY.scheduledSave}
          </Button>
        }
      />
    </div>
  );

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={
        isCreate
          ? HELM_COPY.scheduledFormNewTitle
          : HELM_COPY.scheduledFormChangeTitle(action.title)
      }
      viewKey={picker.viewKey}
    >
      {picker.view ?? form}
    </FormSheet>
  );
}

export default ScheduledForm;
