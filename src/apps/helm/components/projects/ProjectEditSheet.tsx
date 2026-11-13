import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DateInput from '@/components/DateInput';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import {
  HELM_COPY,
  PROJECT_NAME_MAX,
  PROJECT_OBJECTIVE_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { updateProject } from '@apps/helm/store/actions/projectActions';
import type { OpenProject } from '@apps/helm/types';

interface ProjectEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  project: OpenProject;
}

interface ProjectEditFormProps extends Omit<ProjectEditSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

function ProjectEditForm({
  project,
  onClose,
  requestClose,
  onDirtyChange,
}: ProjectEditFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [name, setName] = useState(project.name);
  const [emoji, setEmoji] = useState(project.emoji ?? '');
  const [objective, setObjective] = useState(project.objective ?? '');
  const [date, setDate] = useState(
    toDateInputValue(project.targetDate ?? undefined),
  );
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = name.trim() === '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateProject(
        user.uid,
        await getHelmEncryption(user.uid),
        project.id,
        {
          name,
          emoji: emoji || null,
          objective: objective.trim() || null,
          targetDate: fromDateInputValue(date) ?? null,
        },
      );
      if (result === 'saved') {
        onClose();
        return;
      }
      addToast({
        title:
          result === 'offline'
            ? HELM_COPY.editNeedsConnection
            : result === 'missing'
              ? HELM_COPY.projectGone
              : HELM_COPY.projectUnreadable,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm project was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
          {HELM_COPY.projectNameField}
        </label>
        <div className='flex items-start gap-3'>
          <EmojiField
            value={emoji}
            ariaLabel={HELM_COPY.projectEmojiField}
            onChange={(value) => edit(setEmoji)(toFirstEmoji(value))}
          />
          <Input
            id={`${fieldId}-name`}
            className='min-w-0 flex-1'
            value={name}
            maxLength={PROJECT_NAME_MAX}
            autoFocus={canFocusFieldOnOpen()}
            onChange={(event) => edit(setName)(event.target.value)}
          />
        </div>
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-objective`} className='text-sm font-medium'>
          {HELM_COPY.projectObjectiveField}
        </label>
        <Input
          id={`${fieldId}-objective`}
          value={objective}
          maxLength={PROJECT_OBJECTIVE_MAX}
          placeholder={HELM_COPY.projectFlowObjectivePlaceholder}
          onChange={(event) => edit(setObjective)(event.target.value)}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-date`} className='text-sm font-medium'>
          {HELM_COPY.projectDateField}
        </label>
        <DateInput
          id={`${fieldId}-date`}
          value={date}
          onChange={(event) => edit(setDate)(event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.projectNameMissing : null}
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
          <Button type='button' loading={isSaving} onClick={() => void save()}>
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Change a project's name, emoji, what done looks like and its date. */
function ProjectEditSheet({ isOpen, onClose, project }: ProjectEditSheetProps) {
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
      title={HELM_COPY.projectEditTitle}
    >
      {isOpen && (
        <ProjectEditForm
          project={project}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default ProjectEditSheet;
