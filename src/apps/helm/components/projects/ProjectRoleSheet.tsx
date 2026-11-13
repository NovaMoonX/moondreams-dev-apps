import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, UserMinus } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl from '@/components/SegmentedControl';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
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
  const isDirty =
    role !== current || note !== (project.roleNotes[who.id] ?? '');
  const requestClose = useDiscardGuard({
    isDirty,
    onClose,
    isBusy: isSaving,
  });

  const run = async (change: Parameters<ApplyRole>[1], title: string) => {
    setIsSaving(true);
    const isDone = await onApply({ whoId: who.id }, change, title);
    if (isDone) onClose();
    else setIsSaving(false);
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={HELM_COPY.projectRoleTitle(who.name)}
    >
      <div className='space-y-4'>
        <SegmentedControl
          label={HELM_COPY.projectRoleField}
          options={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          isStacked
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
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className="bg-muted text-foreground relative h-auto min-h-7 max-w-full justify-between gap-2 rounded-full border-0 px-3 py-1 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
          disabled={isSaving}
          onClick={() => {
            onClose();
            onOpenWho(who.id);
          }}
        >
          <span className='min-w-0 text-left'>
            {HELM_COPY.projectRoleOpenPage}
          </span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <Button
          type='button'
          variant='secondary'
          className='text-destructive! border-destructive/40! w-full justify-start gap-2'
          disabled={isSaving}
          onClick={() =>
            void run(
              { role: null },
              HELM_COPY.projectRoleOff(who.name, project.name),
            )
          }
        >
          <UserMinus className='size-4 shrink-0' aria-hidden='true' />
          <span>{HELM_COPY.projectRoleOffMenu}</span>
        </Button>
        <ModalFooterActions
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
