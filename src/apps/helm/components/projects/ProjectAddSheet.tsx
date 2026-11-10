import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl from '@/components/SegmentedControl';
import { useAppSelector } from '@/store';
import type { ApplyRole } from '@apps/helm/components/projects/ProjectPeople';
import { HELM_COPY, PROJECT_ROLE_NOTE_MAX } from '@apps/helm/constants';
import type { OpenProject } from '@apps/helm/types';

interface ProjectAddSheetProps {
  isOpen: boolean;
  project: OpenProject;
  onClose: () => void;
  onApply: ApplyRole;
}

const ROLE_OPTIONS = [
  { value: 'key', label: HELM_COPY.projectRoleKey },
  { value: 'involved', label: HELM_COPY.projectRoleInvolved },
] as const;

const TIER_ORDER = { close: 0, regular: 1, passing: 2 } as const;

interface AddFormProps {
  project: OpenProject;
  onClose: () => void;
  onApply: ApplyRole;
}

function AddForm({ project, onClose, onApply }: AddFormProps) {
  const people = useAppSelector((state) => state.helm.who.items);
  const [choice, setChoice] = useState('');
  const [newName, setNewName] = useState('');
  const [role, setRole] = useState<'key' | 'involved'>('involved');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const options = people
    .filter((who) => !who.isUnreadable && !(who.id in project.whoRoles))
    .sort(
      (left, right) =>
        TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
        left.name.localeCompare(right.name),
    )
    .map((who) => ({ value: who.id, label: who.name }));
  const isNew = choice === NEW_CHOICE || options.length === 0;
  const name = newName.trim();
  const isMissing = isNew ? name === '' : choice === '';

  const add = async () => {
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    const label = isNew
      ? name
      : (options.find((option) => option.value === choice)?.label ?? '');
    const isDone = await onApply(
      isNew ? { newName: name } : { whoId: choice },
      { role, note },
      HELM_COPY.projectRoleAdded(label, project.name),
    );
    if (isDone) onClose();
    else setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.projectAddPick}
        </span>
        <PickOrCreate
          label={HELM_COPY.projectAddPick}
          options={options}
          choice={choice}
          newText={newName}
          onChange={(next, text) => {
            setChoice(next);
            setNewName(text);
          }}
          newPillLabel={HELM_COPY.projectAddNew}
          newPlaceholder={HELM_COPY.projectAddNewPlaceholder}
          maxLength={80}
        />
      </div>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.projectAddRole}
        </span>
        <SegmentedControl
          label={HELM_COPY.projectAddRole}
          options={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
        />
      </div>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.projectRoleNoteField}
        </span>
        <Input
          aria-label={HELM_COPY.projectRoleNoteField}
          value={note}
          maxLength={PROJECT_ROLE_NOTE_MAX}
          placeholder={HELM_COPY.projectRoleNotePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.projectAddNeedsPerson : null}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSaving} onClick={() => void add()}>
            {HELM_COPY.projectAddAction}
          </Button>
        }
      />
    </div>
  );
}

/** Put someone on a project: pick a person you know or name someone new, say Key or Involved, and add a note if it helps. */
function ProjectAddSheet({
  isOpen,
  project,
  onClose,
  onApply,
}: ProjectAddSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.projectAddTitle}
    >
      {isOpen && (
        <AddForm project={project} onClose={onClose} onApply={onApply} />
      )}
    </FormSheet>
  );
}

export default ProjectAddSheet;
