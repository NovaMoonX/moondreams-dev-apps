import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import SkipQuestionButton from '@/components/SkipQuestionButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAppSelector } from '@/store';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import {
  OftenFields,
  TimesFields,
} from '@apps/helm/components/habits/HabitWhenFields';
import GoalWhyField from '@apps/helm/components/projects/GoalWhyField';
import {
  HABIT_NAME_MAX,
  HABITS_ACTIVE_MAX,
  HELM_COPY,
  PROJECT_NAME_MAX,
} from '@apps/helm/constants';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createHabit } from '@apps/helm/store/actions/habitActions';
import { createGoal } from '@apps/helm/store/actions/goalActions';
import { selectKeptHabits } from '@apps/helm/store/selectors/habitSelectors';
import { selectOpenProjects } from '@apps/helm/store/selectors/projectSelectors';
import {
  EMPTY_WHEN,
  formatCadence,
  fromWhenDraft,
  readWhenBlocker,
  type WhenDraft,
} from '@apps/helm/utils/habitDraft';
import { UNDO_WINDOW_MS } from '@/lib/undo';

interface GoalQuestionFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

type StepChoice = 'habit' | 'none';

interface Answers {
  name: string;
  emoji: string;
  why: string;
  isWhySkipped: boolean;
  step: StepChoice;
  isStepSkipped: boolean;
  habitName: string;
  when: WhenDraft;
}

const INITIAL: Answers = {
  name: '',
  emoji: '',
  why: '',
  isWhySkipped: false,
  step: 'none',
  isStepSkipped: false,
  habitName: '',
  when: { ...EMPTY_WHEN, mode: 'anyTime' },
};

const STEP_OPTIONS: readonly PillOption<StepChoice>[] = [
  { value: 'habit', label: HELM_COPY.goalFlowStepHabit },
];

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

interface GoalFlowFormProps extends Omit<GoalQuestionFlowProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function GoalFlowForm({
  onClose,
  onOpenProject,
  requestClose,
  onDirtyChange,
}: GoalFlowFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const clock = useHabitClock();
  const profile = useAppSelector((state) => state.helm.profile);
  const active = useAppSelector(selectOpenProjects);
  const kept = useAppSelector(selectKeptHabits);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [isSaving, setIsSaving] = useState(false);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const set = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    onDirtyChange(true);
  };
  const name = answers.name.trim();
  const why = answers.why.trim();
  const habitName = answers.habitName.trim();
  const isHabit = answers.step === 'habit';
  const isHabitFull = kept.length >= HABITS_ACTIVE_MAX;
  const whenBlocker = readWhenBlocker(answers.when);
  const stepBlocker = !isHabit
    ? null
    : isHabitFull
      ? HELM_COPY.goalFlowTooManyHabits(HABITS_ACTIVE_MAX)
      : habitName === ''
        ? HELM_COPY.habitEditNameMissing
        : whenBlocker;
  const dayWindow = {
    dayStartTime: profile?.dayStartTime ?? '08:00',
    dayEndTime: profile?.dayEndTime ?? '22:00',
  };

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: HELM_COPY.goalFlowNameQuestion,
      summaryLabel: HELM_COPY.projectFlowNameLabel,
      summaryValue: name ? `${answers.emoji} ${name}`.trim() : '',
      summaryText: name,
      isAnswered: name !== '',
      blocker: HELM_COPY.projectNameMissing,
      render: () => (
        <div className='flex items-start gap-3'>
          <EmojiField
            value={answers.emoji}
            ariaLabel={HELM_COPY.projectFlowEmojiLabel}
            onChange={(value) => set({ emoji: toFirstEmoji(value) })}
          />
          <Input
            variant='outline'
            className='min-w-0 flex-1'
            aria-label={HELM_COPY.projectFlowNameLabel}
            placeholder={HELM_COPY.goalFlowNamePlaceholder}
            maxLength={PROJECT_NAME_MAX}
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
      id: 'why',
      title: HELM_COPY.goalFlowWhyQuestion,
      summaryLabel: HELM_COPY.goalFlowWhyLabel,
      summaryValue: why || HELM_COPY.projectFlowNone,
      isAnswered: why !== '' || answers.isWhySkipped,
      render: () => (
        <div className='space-y-3'>
          <GoalWhyField
            value={answers.why}
            ariaLabel={HELM_COPY.goalFlowWhyLabel}
            placeholder={HELM_COPY.goalFlowWhyPlaceholder}
            onChange={(value) => set({ why: value, isWhySkipped: false })}
          />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.goalFlowWhyHint}
          </p>
          <SkipQuestionButton
            note={HELM_COPY.goalFlowWhySkipNote}
            label={HELM_COPY.goalFlowWhySkip}
            skippedLabel={HELM_COPY.goalFlowWhySkip}
            isSkipped={answers.isWhySkipped}
            onSkip={() => {
              set({ why: '', isWhySkipped: true });
              flow.moveOnFrom('why');
            }}
          />
        </div>
      ),
    },
    {
      id: 'step',
      title: HELM_COPY.goalFlowStepQuestion,
      summaryLabel: HELM_COPY.goalFlowStepLabel,
      summaryValue: isHabit
        ? [
            habitName,
            formatCadence(fromWhenDraft(answers.when, null, 0).cadence),
          ]
            .filter(Boolean)
            .join(' · ')
        : HELM_COPY.goalFlowStepNone,
      isAnswered: stepBlocker === null,
      blocker: stepBlocker ?? undefined,
      render: () => (
        <div className='space-y-4'>
          <PillGroup
            label={HELM_COPY.goalFlowStepLabel}
            options={STEP_OPTIONS}
            value={answers.step}
            onChange={(step) => set({ step, isStepSkipped: false })}
          />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.goalFlowStepHint}
          </p>
          {isHabit && (
            <div className='space-y-4'>
              <div className='space-y-1.5'>
                <span className='block text-sm font-medium'>
                  {HELM_COPY.goalFlowHabitName}
                </span>
                <Input
                  variant='outline'
                  aria-label={HELM_COPY.goalFlowHabitName}
                  placeholder={HELM_COPY.goalFlowHabitPlaceholder}
                  maxLength={HABIT_NAME_MAX}
                  value={answers.habitName}
                  onChange={(event) => set({ habitName: event.target.value })}
                />
              </div>
              <OftenFields
                draft={answers.when}
                showsLabels
                onChange={(when) => set({ when })}
              />
              <TimesFields
                draft={answers.when}
                profile={dayWindow}
                showsLabels
                onChange={(when) => set({ when })}
              />
            </div>
          )}
          <SkipQuestionButton
            note={HELM_COPY.goalFlowStepSkipNote}
            label={HELM_COPY.goalFlowStepNone}
            skippedLabel={HELM_COPY.goalFlowStepNone}
            isSkipped={answers.isStepSkipped}
            onSkip={() => {
              set({ step: 'none', isStepSkipped: true });
              flow.moveOnFrom('step');
            }}
          />
        </div>
      ),
    },
  ];
  const flow = useQuestionFlow({ steps });
  const openId = flow.open?.id ?? null;
  const canCreate = name !== '' && stepBlocker === null;

  const create = async () => {
    if (!user || isSaving || !canCreate) return;
    const existing = active.find(
      (project) => project.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      addToast({
        title: HELM_COPY.goalFlowDuplicate(existing.name),
        type: 'info',
      });
      onClose();
      onOpenProject(existing.id);
      return;
    }
    setIsSaving(true);
    try {
      const made = await createGoal(user.uid, {
        name,
        emoji: answers.emoji || null,
        whyText: why || null,
      });
      made.written.catch((error: unknown) => {
        console.error('Helm goal was not saved', error);
        addToast({ title: HELM_COPY.goalCreateFailed, type: 'error' });
      });
      const madeHabit = isHabit
        ? await createHabit(user.uid, await getHelmEncryption(user.uid), {
            name: habitName,
            emoji: answers.emoji || null,
            notes: null,
            isCare: false,
            forWhoId: null,
            projectId: made.id,
            startsOn: Date.parse(`${clock.dayKey}T00:00:00Z`),
            when: fromWhenDraft(answers.when, null, Date.now()),
          }).then(
            (habit) => {
              habit.written.catch((error: unknown) => {
                console.error('Helm goal habit was not saved', error);
                addToast({
                  title: HELM_COPY.goalHabitFailed(name),
                  type: 'error',
                });
              });
              return habit;
            },
            (error: unknown) => {
              console.error('Helm goal habit was not added', error);
              addToast({
                title: HELM_COPY.goalHabitFailed(name),
                type: 'error',
              });
              return null;
            },
          )
        : null;
      addToast({
        duration: UNDO_WINDOW_MS,
        title: HELM_COPY.goalCreatedToast(name),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void Promise.all([made.undo(), madeHabit?.undo()]).catch(
              (error: unknown) => {
                console.error('Helm goal was not taken back', error);
                addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
              },
            ),
        },
      });
      onClose();
      onOpenProject(made.id);
    } catch (error) {
      console.error('Helm goal was not started', error);
      addToast({ title: HELM_COPY.goalCreateFailed, type: 'error' });
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
              {HELM_COPY.goalFlowCreate}
            </Button>
          ) : (
            <Button
              type='button'
              disabled={openId !== 'name' && !flow.open?.isAnswered}
              onClick={() => {
                if (!flow.open?.isAnswered) setIsNameTouched(true);
                flow.advance();
              }}
            >
              {HELM_COPY.projectFlowNext}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Start a goal one question at a time: its name and emoji, why it matters, and a regular step kept as a habit. Opens the goal it makes. */
function GoalQuestionFlow({
  isOpen,
  onClose,
  onOpenProject,
}: GoalQuestionFlowProps) {
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
      title={HELM_COPY.goalFlowTitle}
    >
      {isOpen && (
        <GoalFlowForm
          onClose={close}
          onOpenProject={onOpenProject}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default GoalQuestionFlow;
