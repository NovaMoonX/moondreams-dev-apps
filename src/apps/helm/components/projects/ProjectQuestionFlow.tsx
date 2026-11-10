import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DateInput from '@/components/DateInput';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAppSelector } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import {
  HELM_COPY,
  PROJECT_NAME_MAX,
  PROJECT_OBJECTIVE_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createProject } from '@apps/helm/store/actions/projectActions';
import { selectActiveProjects } from '@apps/helm/store/selectors/projectSelectors';

interface ProjectQuestionFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

interface Answers {
  name: string;
  emoji: string;
  objective: string;
  date: string;
  /** Steps the person skipped on purpose. */
  skipped: string[];
}

const INITIAL: Answers = {
  name: '',
  emoji: '',
  objective: '',
  date: '',
  skipped: [],
};

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

interface ProjectFlowFormProps extends Omit<
  ProjectQuestionFlowProps,
  'isOpen'
> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function ProjectFlowForm({
  onClose,
  onOpenProject,
  requestClose,
  onDirtyChange,
}: ProjectFlowFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const active = useAppSelector(selectActiveProjects);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    onDirtyChange(true);
  };
  const isSkipped = (id: string) => answers.skipped.includes(id);
  const skip = (id: string, moveOn: () => void) => {
    set({ skipped: [...answers.skipped, id] });
    moveOn();
  };
  const date = fromDateInputValue(answers.date) ?? null;
  const name = answers.name.trim();

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: HELM_COPY.projectFlowNameQuestion,
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
            placeholder={HELM_COPY.projectFlowNamePlaceholder}
            maxLength={PROJECT_NAME_MAX}
            autoFocus={canFocusFieldOnOpen()}
            value={answers.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </div>
      ),
    },
    {
      id: 'objective',
      title: HELM_COPY.projectFlowObjectiveQuestion,
      summaryLabel: HELM_COPY.projectFlowObjectiveLabel,
      summaryValue: answers.objective.trim() || HELM_COPY.projectFlowNone,
      isAnswered: answers.objective.trim() !== '' || isSkipped('objective'),
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <Input
            variant='outline'
            aria-label={HELM_COPY.projectFlowObjectiveLabel}
            placeholder={HELM_COPY.projectFlowObjectivePlaceholder}
            maxLength={PROJECT_OBJECTIVE_MAX}
            value={answers.objective}
            onChange={(event) => set({ objective: event.target.value })}
          />
          <RevealChip onClick={() => skip('objective', moveOn)}>
            {HELM_COPY.projectFlowSkip}
          </RevealChip>
        </div>
      ),
    },
    {
      id: 'date',
      title: HELM_COPY.projectFlowDateQuestion,
      summaryLabel: HELM_COPY.projectFlowDateLabel,
      summaryValue:
        date === null ? HELM_COPY.projectFlowNone : formatDateUTC(date),
      isAnswered: date !== null || isSkipped('date'),
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <DateInput
            aria-label={HELM_COPY.projectFlowDateLabel}
            value={answers.date}
            onChange={(event) => set({ date: event.target.value })}
          />
          <RevealChip onClick={() => skip('date', moveOn)}>
            {HELM_COPY.projectFlowSkip}
          </RevealChip>
        </div>
      ),
    },
  ];
  const flow = useQuestionFlow({ steps });
  const create = async () => {
    if (!user || isSaving || name === '') return;
    const existing = active.find(
      (project) => project.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      addToast({
        title: HELM_COPY.projectFlowDuplicate(existing.name),
        type: 'info',
      });
      onClose();
      onOpenProject(existing.id);
      return;
    }
    setIsSaving(true);
    try {
      const made = await createProject(
        user.uid,
        await getHelmEncryption(user.uid),
        {
          name,
          emoji: answers.emoji || null,
          objective: answers.objective.trim() || null,
          targetDate: date,
        },
      );
      made.written.catch((error: unknown) => {
        console.error('Helm project was not saved', error);
        addToast({ title: HELM_COPY.projectCreateFailed, type: 'error' });
      });
      addToast({
        title: HELM_COPY.projectCreatedToast(name),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void made.undo().catch((error: unknown) => {
              console.error('Helm project was not taken back', error);
              addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
            }),
        },
      });
      onClose();
      onOpenProject(made.id);
    } catch (error) {
      console.error('Helm project was not started', error);
      addToast({ title: HELM_COPY.projectCreateFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-5'>
      <QuestionFlow flow={flow} />
      <ModalFooterActions
        note={flow.hasReviewed ? null : flow.blocker}
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
              disabled={name === ''}
              onClick={() => void create()}
            >
              {HELM_COPY.projectFlowCreate}
            </Button>
          ) : (
            <Button
              type='button'
              disabled={!flow.open?.isAnswered}
              onClick={flow.advance}
            >
              {HELM_COPY.projectFlowNext}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Start a project one question at a time: its name and emoji, what done looks like, a date; each after the first can be skipped. Opens the project it makes, with Undo. */
function ProjectQuestionFlow({
  isOpen,
  onClose,
  onOpenProject,
}: ProjectQuestionFlowProps) {
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
      title={HELM_COPY.projectFlowTitle}
    >
      {isOpen && (
        <ProjectFlowForm
          onClose={close}
          onOpenProject={onOpenProject}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default ProjectQuestionFlow;
