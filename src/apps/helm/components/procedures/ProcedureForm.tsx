import { useId, useState } from 'react';

import {
  Button,
  Input,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { generateUuid } from '@/utils';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import {
  HELM_COPY,
  PROCEDURE_GROUP_NAME_CAP,
  PROCEDURE_STEP_DETAIL_CAP,
  PROCEDURE_STEP_TEXT_CAP,
  PROCEDURE_TITLE_CAP,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  createProcedure,
  saveProcedure,
} from '@apps/helm/store/actions/procedureActions';
import type { OpenProcedure } from '@apps/helm/types';
import {
  addGroup,
  addStep,
  canMoveStep,
  fromProcedure,
  isGroupsFull,
  isStepsFull,
  moveStep,
  orderedSteps,
  removeGroup,
  removeStep,
  renameGroup,
  setStepGroup,
  toContent,
  updateStep,
  type DraftStep,
  type ProcedureDraft,
} from '@apps/helm/utils/procedureDraft';

interface ProcedureFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The procedure being changed; null starts a new one. */
  procedure: OpenProcedure | null;
  /** Runs once a new procedure is kept, to open it. */
  onMade?: (procedureId: string) => void;
}

interface ProcedureFormProps extends Omit<ProcedureFormSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const NO_GROUP = 'none';
const ICON_BUTTON =
  "relative size-9 min-w-9 shrink-0 p-0 before:absolute before:-inset-0.5 before:content-['']";

const startOf = (procedure: OpenProcedure | null): ProcedureDraft =>
  procedure
    ? fromProcedure(procedure)
    : {
        title: '',
        groups: [],
        steps: [{ id: generateUuid(), text: '', detail: null, groupId: null }],
      };

interface StepCardProps {
  draft: ProcedureDraft;
  step: DraftStep;
  onChange: (next: ProcedureDraft) => void;
}

function StepCard({ draft, step, onChange }: StepCardProps) {
  const [isDetailShown, setIsDetailShown] = useState(step.detail !== null);

  return (
    <li className='helm-card space-y-2 p-3'>
      <div className='flex items-start gap-1'>
        <Input
          aria-label={HELM_COPY.procedureStepField}
          value={step.text}
          maxLength={PROCEDURE_STEP_TEXT_CAP}
          placeholder={HELM_COPY.procedureStepPlaceholder}
          onChange={(event) =>
            onChange(updateStep(draft, step.id, { text: event.target.value }))
          }
        />
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={HELM_COPY.procedureMoveUp}
          disabled={!canMoveStep(draft, step.id, 'up')}
          className={ICON_BUTTON}
          onClick={() => onChange(moveStep(draft, step.id, 'up'))}
        >
          <ChevronUp className='size-4' aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={HELM_COPY.procedureMoveDown}
          disabled={!canMoveStep(draft, step.id, 'down')}
          className={ICON_BUTTON}
          onClick={() => onChange(moveStep(draft, step.id, 'down'))}
        >
          <ChevronDown className='size-4' aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={HELM_COPY.procedureRemoveStep}
          className={`${ICON_BUTTON} text-destructive!`}
          onClick={() => onChange(removeStep(draft, step.id))}
        >
          <Trash2 className='size-4' aria-hidden='true' />
        </Button>
      </div>
      {isDetailShown ? (
        <Textarea
          aria-label={HELM_COPY.procedureDetailField}
          variant='outline'
          rows={2}
          autoExpand
          value={step.detail ?? ''}
          maxLength={PROCEDURE_STEP_DETAIL_CAP}
          placeholder={HELM_COPY.procedureStepDetail}
          onChange={(event) =>
            onChange(
              updateStep(draft, step.id, {
                detail: event.target.value === '' ? null : event.target.value,
              }),
            )
          }
        />
      ) : (
        <div className='flex flex-wrap gap-2'>
          <RevealChip
            icon={<Plus className='size-4' aria-hidden='true' />}
            onClick={() => setIsDetailShown(true)}
          >
            {HELM_COPY.procedureStepDetail}
          </RevealChip>
        </div>
      )}
      {draft.groups.length > 0 && (
        <Select
          aria-label={HELM_COPY.procedurePutInGroup}
          className='h-10 min-h-10'
          options={[
            { value: NO_GROUP, text: HELM_COPY.procedureNoGroup },
            ...draft.groups.map((group) => ({
              value: group.id,
              text: group.name || HELM_COPY.procedureGroupFallback,
            })),
          ]}
          value={step.groupId ?? NO_GROUP}
          onChange={(value) =>
            onChange(
              setStepGroup(draft, step.id, value === NO_GROUP ? null : value),
            )
          }
        />
      )}
    </li>
  );
}

function AddStepButton({
  draft,
  groupId,
  onChange,
}: {
  draft: ProcedureDraft;
  groupId: string | null;
  onChange: (next: ProcedureDraft) => void;
}) {
  return isStepsFull(draft) ? (
    <LockedButton
      size='sm'
      label={HELM_COPY.procedureAddStep}
      title={HELM_COPY.procedureStepsFull}
    >
      <p>{HELM_COPY.procedureStepsFull}</p>
    </LockedButton>
  ) : (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      onClick={() => onChange(addStep(draft, generateUuid(), groupId))}
    >
      <Plus className='size-4' aria-hidden='true' />
      {HELM_COPY.procedureAddStep}
    </Button>
  );
}

function ProcedureFormFields({
  procedure,
  onClose,
  onMade,
  requestClose,
  onDirtyChange,
}: ProcedureFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [expectedVersion] = useState(procedure?.version ?? 1);
  const [draft, setDraft] = useState(() => startOf(procedure));
  const [isBusy, setIsBusy] = useState(false);
  const [hasRaced, setHasRaced] = useState(false);
  const content = toContent(draft);
  const isReady = content.title !== '' && content.steps.length > 0;

  const change = (next: ProcedureDraft) => {
    setDraft(next);
    onDirtyChange(true);
  };

  const reportFailure = (error: unknown) => {
    console.error('Helm procedure was not saved', error);
    addToast({ title: HELM_COPY.editFailed, type: 'error' });
  };

  const save = async () => {
    if (!user || isBusy || !isReady) return;
    setIsBusy(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      if (procedure) {
        const result = await saveProcedure(
          user.uid,
          encryption,
          procedure.id,
          expectedVersion,
          draft,
        );
        if (result === 'saved') {
          addToast({ title: HELM_COPY.procedureSaved, type: 'success' });
          onClose();
          return;
        }
        if (result === 'changed' || result === 'missing') setHasRaced(true);
        else {
          addToast({
            title:
              result === 'offline'
                ? HELM_COPY.procedureNeedsConnection
                : HELM_COPY.editFailed,
            type: 'info',
          });
        }
      } else {
        const result = await createProcedure(user.uid, encryption, draft);
        if (result.kind === 'made') {
          result.written.catch(reportFailure);
          addToast({
            title: HELM_COPY.procedureMade(content.title),
            type: 'success',
          });
          onClose();
          onMade?.(result.id);
          return;
        }
      }
    } catch (error) {
      reportFailure(error);
    }
    setIsBusy(false);
  };

  const blocks = [
    { groupId: null as string | null, name: null as string | null },
    ...draft.groups.map((group) => ({
      groupId: group.id as string | null,
      name: group.name as string | null,
    })),
  ];
  const ordered = orderedSteps(draft);

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-title`} className='text-sm font-medium'>
          {HELM_COPY.procedureTitleLabel}
        </label>
        <Input
          id={`${fieldId}-title`}
          value={draft.title}
          maxLength={PROCEDURE_TITLE_CAP}
          placeholder={HELM_COPY.procedureTitlePlaceholder}
          autoFocus={canFocusFieldOnOpen() && procedure === null}
          onChange={(event) => change({ ...draft, title: event.target.value })}
        />
      </div>
      {blocks.map((block) => {
        const steps = ordered.filter((step) =>
          block.groupId === null
            ? !draft.groups.some((group) => group.id === step.groupId)
            : step.groupId === block.groupId,
        );
        return (
          <section key={block.groupId ?? 'ungrouped'} className='space-y-2'>
            {block.groupId !== null && (
              <div className='flex items-center gap-1'>
                <Input
                  aria-label={HELM_COPY.procedureGroupField}
                  value={block.name ?? ''}
                  maxLength={PROCEDURE_GROUP_NAME_CAP}
                  onChange={(event) =>
                    change(
                      renameGroup(
                        draft,
                        block.groupId as string,
                        event.target.value,
                      ),
                    )
                  }
                />
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  aria-label={HELM_COPY.procedureRemoveGroup}
                  className={`${ICON_BUTTON} text-destructive!`}
                  onClick={() =>
                    change(removeGroup(draft, block.groupId as string))
                  }
                >
                  <Trash2 className='size-4' aria-hidden='true' />
                </Button>
              </div>
            )}
            {steps.length > 0 && (
              <ul className='space-y-2'>
                {steps.map((step) => (
                  <StepCard
                    key={step.id}
                    draft={draft}
                    step={step}
                    onChange={change}
                  />
                ))}
              </ul>
            )}
            <AddStepButton
              draft={draft}
              groupId={block.groupId}
              onChange={change}
            />
          </section>
        );
      })}
      <div className='flex flex-wrap gap-2'>
        {isGroupsFull(draft) ? (
          <LockedButton
            size='sm'
            label={HELM_COPY.procedureAddGroup}
            title={HELM_COPY.procedureGroupsFull}
          >
            <p>{HELM_COPY.procedureGroupsFull}</p>
          </LockedButton>
        ) : (
          <RevealChip
            icon={<Plus className='size-4' aria-hidden='true' />}
            onClick={() => change(addGroup(draft, generateUuid(), ''))}
          >
            {HELM_COPY.procedureAddGroup}
          </RevealChip>
        )}
      </div>
      {hasRaced && (
        <Button type='button' variant='tertiary' onClick={onClose}>
          {HELM_COPY.procedureRaced}
        </Button>
      )}
      <ModalFooterActions
        note={!isReady ? HELM_COPY.procedureNeedsWords : null}
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
          <Button
            type='button'
            loading={isBusy}
            disabled={!isReady}
            onClick={() => void save()}
          >
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Make a procedure or change one: a title, steps in groups the person names, each step movable up and down, up to 60 steps. */
function ProcedureForm({
  isOpen,
  onClose,
  procedure,
  onMade,
}: ProcedureFormSheetProps) {
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
      title={procedure ? HELM_COPY.procedureEditTitle : HELM_COPY.procedureNew}
    >
      {isOpen && (
        <ProcedureFormFields
          procedure={procedure}
          onClose={close}
          onMade={onMade}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default ProcedureForm;
