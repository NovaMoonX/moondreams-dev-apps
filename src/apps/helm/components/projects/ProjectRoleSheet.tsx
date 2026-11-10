import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl from '@/components/SegmentedControl';
import type { ApplyRole } from '@apps/helm/components/projects/ProjectPeople';
import { HELM_COPY, PROJECT_ROLE_NOTE_MAX } from '@apps/helm/constants';
import type { OpenProject, OpenWho, ProjectRole } from '@apps/helm/types';

interface ProjectRoleSheetProps {
  project: OpenProject;
  who: OpenWho;
  onClose: () => void;
  onApply: ApplyRole;
  onOpenWho: (whoId: string) => void;
}

const ROLE_OPTIONS = [
  { value: 'key', label: HELM_COPY.projectRoleKey },
  { value: 'involved', label: HELM_COPY.projectRoleInvolved },
  { value: 'mentioned', label: HELM_COPY.projectRoleMentioned },
] as const;

const roleWords: Record<ProjectRole, string> = {
  key: HELM_COPY.projectRoleKey.toLowerCase(),
  involved: HELM_COPY.projectRoleInvolved.toLowerCase(),
  mentioned: HELM_COPY.projectRoleMentioned.toLowerCase(),
};

/** One person's part in a project: Key, Involved or Mentioned, a short note, or off the project. */
function ProjectRoleSheet({
  project,
  who,
  onClose,
  onApply,
  onOpenWho,
}: ProjectRoleSheetProps) {
  const fieldId = useId();
  const current = project.whoRoles[who.id] ?? 'mentioned';
  const [role, setRole] = useState<ProjectRole>(current);
  const [note, setNote] = useState(project.roleNotes[who.id] ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const hasNote = role !== 'mentioned';

  const run = async (change: Parameters<ApplyRole>[1], title: string) => {
    setIsSaving(true);
    const isDone = await onApply({ whoId: who.id }, change, title);
    if (isDone) onClose();
    else setIsSaving(false);
  };

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={HELM_COPY.projectRoleTitle(who.name)}
    >
      <div className='space-y-4'>
        <SegmentedControl
          label={HELM_COPY.projectRoleField}
          options={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
        />
        {hasNote && (
          <div className='space-y-1.5'>
            <label htmlFor={`${fieldId}-note`} className='text-sm font-medium'>
              {HELM_COPY.projectRoleNoteField}
            </label>
            <Input
              id={`${fieldId}-note`}
              value={note}
              maxLength={PROJECT_ROLE_NOTE_MAX}
              placeholder={HELM_COPY.projectRoleNotePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            disabled={isSaving}
            onClick={() => {
              onClose();
              onOpenWho(who.id);
            }}
          >
            {HELM_COPY.projectRoleOpenPage}
          </Button>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='text-destructive!'
            disabled={isSaving}
            onClick={() =>
              void run(
                { role: null },
                HELM_COPY.projectRoleOff(who.name, project.name),
              )
            }
          >
            {HELM_COPY.projectRoleOffMenu}
          </Button>
        </div>
        <ModalFooterActions
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
            <Button
              type='button'
              loading={isSaving}
              onClick={() =>
                void run(
                  { role, note: hasNote ? note : null },
                  HELM_COPY.projectRoleSet(who.name, roleWords[role]),
                )
              }
            >
              {HELM_COPY.projectRoleSave}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default ProjectRoleSheet;
