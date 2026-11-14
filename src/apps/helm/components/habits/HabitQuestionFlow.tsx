import { useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAppSelector } from '@/store';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import HabitWhoField from '@apps/helm/components/habits/HabitWhoField';
import {
  OftenFields,
  TimesFields,
} from '@apps/helm/components/habits/HabitWhenFields';
import {
  HABIT_NAME_MAX,
  HABITS_ACTIVE_MAX,
  HABIT_NOTES_MAX,
  HELM_COPY,
} from '@apps/helm/constants';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createHabit } from '@apps/helm/store/actions/habitActions';
import { selectKeptHabits } from '@apps/helm/store/selectors/habitSelectors';
import { selectWhoById } from '@apps/helm/store/selectors/whoSelectors';
import {
  EMPTY_WHEN,
  formatCadence,
  fromWhenDraft,
  readWhenBlocker,
  type WhenDraft,
} from '@apps/helm/utils/habitDraft';

interface HabitQuestionFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHabit: (habitId: string) => void;
}

interface Answers {
  name: string;
  emoji: string;
  when: WhenDraft;
  isCare: boolean;
  forWhoId: string | null;
  notes: string;
  /** Steps the person skipped on purpose. */
  skipped: string[];
}

const INITIAL: Answers = {
  name: '',
  emoji: '',
  when: EMPTY_WHEN,
  isCare: false,
  forWhoId: null,
  notes: '',
  skipped: [],
};

const CARE_OPTIONS: readonly PillOption<'yes' | 'no'>[] = [
  { value: 'no', label: HELM_COPY.habitFlowNo },
  { value: 'yes', label: HELM_COPY.habitFlowYes },
];

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

const SKIPPABLE = ['notes'];

interface HabitFlowFormProps extends Omit<HabitQuestionFlowProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function HabitFlowForm({
  onClose,
  onOpenHabit,
  requestClose,
  onDirtyChange,
}: HabitFlowFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const clock = useHabitClock();
  const profile = useAppSelector((state) => state.helm.profile);
  const kept = useAppSelector(selectKeptHabits);
  const whoById = useAppSelector(selectWhoById);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [isSaving, setIsSaving] = useState(false);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const set = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    onDirtyChange(true);
  };
  const name = answers.name.trim();
  const whenBlocker = readWhenBlocker(answers.when);
  const dayWindow = {
    dayStartTime: profile?.dayStartTime ?? '08:00',
    dayEndTime: profile?.dayEndTime ?? '22:00',
  };
  const whenSummary = [
    formatCadence(fromWhenDraft(answers.when, null, 0).cadence),
    answers.when.mode === 'parts'
      ? answers.when.windows.map((window) => window.label).join(', ')
      : answers.when.mode === 'count'
        ? HELM_COPY.habitWindowsCount(answers.when.perDay)
        : HELM_COPY.habitWindowsThroughDay,
  ]
    .filter(Boolean)
    .join(' · ');

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: HELM_COPY.habitFlowNameQuestion,
      summaryLabel: HELM_COPY.habitFlowNameLabel,
      summaryValue: name ? `${answers.emoji} ${name}`.trim() : '',
      summaryText: name,
      isAnswered: name !== '',
      blocker: HELM_COPY.habitEditNameMissing,
      render: () => (
        <div className='flex items-start gap-3'>
          <EmojiField
            value={answers.emoji}
            ariaLabel={HELM_COPY.habitEditEmoji}
            onChange={(value) => set({ emoji: toFirstEmoji(value) })}
          />
          <Input
            variant='outline'
            className='min-w-0 flex-1'
            aria-label={HELM_COPY.habitFlowNameLabel}
            placeholder={HELM_COPY.habitFlowNamePlaceholder}
            maxLength={HABIT_NAME_MAX}
            autoFocus={canFocusFieldOnOpen()}
            value={answers.name}
            onChange={(event) => {
              setIsNameTouched(true);
              set({ name: event.target.value });
            }}
          />
        </div>
      ),
    },
    {
      id: 'often',
      title: HELM_COPY.habitFlowOftenQuestion,
      summaryLabel: HELM_COPY.habitFlowOftenLabel,
      summaryValue: formatCadence(fromWhenDraft(answers.when, null, 0).cadence),
      isAnswered:
        answers.when.often !== 'onWeekdays' || answers.when.weekdays.length > 0,
      blocker: HELM_COPY.habitWhenNeedsDay,
      render: () => (
        <OftenFields draft={answers.when} onChange={(when) => set({ when })} />
      ),
    },
    {
      id: 'when',
      title: HELM_COPY.habitFlowWhenQuestion,
      summaryLabel: HELM_COPY.habitFlowWhenLabel,
      summaryValue: whenSummary,
      isAnswered: whenBlocker === null,
      blocker: whenBlocker ?? undefined,
      render: () => (
        <TimesFields
          draft={answers.when}
          profile={dayWindow}
          onChange={(when) => set({ when })}
        />
      ),
    },
    {
      id: 'care',
      title: HELM_COPY.habitFlowCareQuestion,
      summaryLabel: HELM_COPY.habitFlowCareLabel,
      summaryValue: answers.isCare
        ? HELM_COPY.habitFlowYes
        : HELM_COPY.habitFlowNo,
      isAnswered: true,
      render: () => (
        <div className='space-y-3'>
          <PillGroup
            label={HELM_COPY.habitFlowCareLabel}
            options={CARE_OPTIONS}
            value={answers.isCare ? 'yes' : 'no'}
            onChange={(value) => set({ isCare: value === 'yes' })}
          />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.habitFlowCareHint}
          </p>
        </div>
      ),
    },
    ...(answers.isCare
      ? [
          {
            id: 'who',
            title: HELM_COPY.habitWhoQuestion,
            summaryLabel: HELM_COPY.habitWhoLabel,
            summaryValue: HELM_COPY.habitWhoSummary(
              answers.forWhoId === null
                ? null
                : (whoById.get(answers.forWhoId)?.name ?? null),
            ),
            isAnswered: true,
            render: () => (
              <HabitWhoField
                value={answers.forWhoId}
                onChange={(forWhoId) => set({ forWhoId })}
              />
            ),
          },
        ]
      : []),
    {
      id: 'notes',
      title: HELM_COPY.habitFlowNotesQuestion,
      summaryLabel: HELM_COPY.habitFlowNotesLabel,
      summaryValue: answers.notes.trim() || HELM_COPY.habitFlowNone,
      isAnswered:
        answers.notes.trim() !== '' || answers.skipped.includes('notes'),
      render: () => (
        <Textarea
          aria-label={HELM_COPY.habitFlowNotesLabel}
          placeholder={HELM_COPY.habitNotesPlaceholder}
          maxLength={HABIT_NOTES_MAX}
          rows={3}
          value={answers.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      ),
    },
  ];
  const flow = useQuestionFlow({ steps });
  const openId = flow.open?.id ?? null;
  const isSkippable = openId !== null && SKIPPABLE.includes(openId);
  const skip = () => {
    if (openId === null) return;
    set({ skipped: [...answers.skipped, openId] });
    flow.moveOnFrom(openId);
  };
  const canCreate = name !== '' && whenBlocker === null;

  const create = async () => {
    if (!user || isSaving || !canCreate) return;
    if (kept.length >= HABITS_ACTIVE_MAX) {
      addToast({
        title: HELM_COPY.habitFlowTooMany(HABITS_ACTIVE_MAX),
        type: 'info',
      });
      return;
    }
    const existing = kept.find(
      (habit) => habit.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      addToast({
        title: HELM_COPY.habitFlowDuplicate(existing.name),
        type: 'info',
      });
      onClose();
      onOpenHabit(existing.id);
      return;
    }
    setIsSaving(true);
    try {
      const made = await createHabit(
        user.uid,
        await getHelmEncryption(user.uid),
        {
          name,
          emoji: answers.emoji || null,
          notes: answers.notes.trim() || null,
          isCare: answers.isCare,
          forWhoId: answers.isCare ? answers.forWhoId : null,
          startsOn: Date.parse(`${clock.dayKey}T00:00:00Z`),
          when: fromWhenDraft(answers.when, null, Date.now()),
        },
      );
      made.written.catch((error: unknown) => {
        console.error('Helm habit was not saved', error);
        addToast({ title: HELM_COPY.habitCreateFailed, type: 'error' });
      });
      addToast({
        title: HELM_COPY.habitCreatedToast(name),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void made.undo().catch((error: unknown) => {
              console.error('Helm habit was not taken back', error);
              addToast({ title: HELM_COPY.habitUndoFailed, type: 'error' });
            }),
        },
      });
      onClose();
      onOpenHabit(made.id);
    } catch (error) {
      console.error('Helm habit was not added', error);
      addToast({ title: HELM_COPY.habitCreateFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-5'>
      <QuestionFlow flow={flow} />
      <ModalFooterActions
        note={flow.hasReviewed || !isNameTouched ? null : flow.blocker}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          flow.hasReviewed ? (
            <Button
              type='button'
              loading={isSaving}
              disabled={!canCreate}
              onClick={() => void create()}
            >
              {HELM_COPY.habitFlowCreate}
            </Button>
          ) : (
            <>
              {isSkippable && (
                <Button type='button' variant='secondary' onClick={skip}>
                  {HELM_COPY.habitFlowSkip}
                </Button>
              )}
              <Button
                type='button'
                disabled={!flow.open?.isAnswered}
                onClick={() => flow.advance()}
              >
                {HELM_COPY.habitFlowNext}
              </Button>
            </>
          )
        }
      />
    </div>
  );
}

/** Add a habit one question at a time: what it is, how often, when in the day, whether it is medicine or care, and a note; the last can be skipped. Opens the habit it makes, with Undo. */
function HabitQuestionFlow({
  isOpen,
  onClose,
  onOpenHabit,
}: HabitQuestionFlowProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.habitFlowTitle}
    >
      {isOpen && (
        <HabitFlowForm
          onClose={close}
          onOpenHabit={onOpenHabit}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default HabitQuestionFlow;
