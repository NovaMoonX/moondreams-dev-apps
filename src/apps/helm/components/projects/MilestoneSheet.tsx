import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DateInput from '@/components/DateInput';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { HELM_COPY, MILESTONE_TITLE_MAX } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  addMilestone,
  editMilestone,
  removeMilestone,
  type MilestoneResult,
} from '@apps/helm/store/actions/projectActions';

export interface MilestoneDraft {
  id: string;
  title: string;
  date: number | null;
}

interface MilestoneSheetProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** The milestone being changed; null starts a new one. */
  milestone: MilestoneDraft | null;
}

interface MilestoneFormProps extends Omit<MilestoneSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const failureLine = (result: Exclude<MilestoneResult, { kind: 'saved' }>) =>
  result.kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : result.kind === 'full'
      ? HELM_COPY.milestonesFull
      : result.kind === 'missing'
        ? HELM_COPY.milestoneGone
        : HELM_COPY.projectUnreadable;

function MilestoneForm({
  projectId,
  milestone,
  onClose,
  requestClose,
  onDirtyChange,
}: MilestoneFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const fieldId = useId();
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [date, setDate] = useState(
    toDateInputValue(milestone?.date ?? undefined),
  );
  const [isTouched, setIsTouched] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isMissing = title.trim() === '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const undoable = (
    result: Extract<MilestoneResult, { kind: 'saved' }>,
    toastTitle: string,
  ) =>
    addToast({
      title: toastTitle,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void result.undo().catch((error: unknown) => {
            console.error('Helm milestone was not put back', error);
            addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
          }),
      },
    });

  const run = async (
    work: (uid: string) => Promise<MilestoneResult>,
    toastTitle: string,
  ) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      const result = await work(user.uid);
      if (result.kind === 'saved') {
        undoable(result, toastTitle);
        onClose();
        return;
      }
      addToast({ title: failureLine(result), type: 'info' });
    } catch (error) {
      console.error('Helm milestone was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const save = async () => {
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    const words = {
      title: title.trim(),
      date: fromDateInputValue(date) ?? null,
    };
    await run(
      async (uid) =>
        milestone
          ? editMilestone(
              uid,
              await getHelmEncryption(uid),
              projectId,
              milestone.id,
              words,
            )
          : addMilestone(uid, await getHelmEncryption(uid), projectId, words),
      milestone
        ? HELM_COPY.milestoneChangedToast(words.title)
        : HELM_COPY.milestoneAddedToast(words.title),
    );
  };

  const remove = async () => {
    if (!milestone) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.deleteConfirm,
      message: HELM_COPY.milestoneDeleteConfirm(milestone.title),
      confirmText: HELM_COPY.deleteConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    await run(
      async (uid) =>
        removeMilestone(
          uid,
          await getHelmEncryption(uid),
          projectId,
          milestone.id,
        ),
      HELM_COPY.milestoneDeletedToast(milestone.title),
    );
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-title`} className='text-sm font-medium'>
          {HELM_COPY.milestoneTitleField}
        </label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          maxLength={MILESTONE_TITLE_MAX}
          placeholder={HELM_COPY.milestoneTitlePlaceholder}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => edit(setTitle)(event.target.value)}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-date`} className='text-sm font-medium'>
          {HELM_COPY.milestoneDateField}
        </label>
        <DateInput
          id={`${fieldId}-date`}
          value={date}
          onChange={(event) => edit(setDate)(event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.milestoneTitleMissing : null}
        leftActions={
          milestone ? (
            <DeleteIconButton
              label={HELM_COPY.deleteConfirm}
              disabled={isBusy}
              onClick={() => void remove()}
            />
          ) : undefined
        }
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isBusy} onClick={() => void save()}>
            {milestone ? HELM_COPY.editSave : HELM_COPY.projectAddAction}
          </Button>
        }
      />
    </div>
  );
}

/** Add a milestone to a project or change one: its title and an optional date, with Delete for one that exists. */
function MilestoneSheet({
  isOpen,
  onClose,
  projectId,
  milestone,
}: MilestoneSheetProps) {
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
      title={
        milestone ? HELM_COPY.milestoneEditTitle : HELM_COPY.milestoneAddTitle
      }
    >
      {isOpen && (
        <MilestoneForm
          projectId={projectId}
          milestone={milestone}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default MilestoneSheet;
