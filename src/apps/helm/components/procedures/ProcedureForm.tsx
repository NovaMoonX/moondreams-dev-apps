import { useId, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
  Input,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Ellipsis, Plus } from 'lucide-react';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import FormScreen from '@/components/FormScreen';
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
  PROCEDURE_STEP_TEXT_CAP,
  PROCEDURE_TITLE_CAP,
} from '@apps/helm/constants';
import ProcedureStepSheet from '@apps/helm/components/procedures/ProcedureStepSheet';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  createProcedure,
  saveProcedure,
} from '@apps/helm/store/actions/procedureActions';
import type { OpenProcedure } from '@apps/helm/types';
import {
  addGroup,
  addStep,
  fromProcedure,
  isGroupsFull,
  isStepsFull,
  orderedSteps,
  removeGroup,
  renameGroup,
  restoreGroup,
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

const ICON_BUTTON = 'size-10 min-w-10 shrink-0 p-0';

const { option } = DropdownMenuFactories;

const startOf = (procedure: OpenProcedure | null): ProcedureDraft =>
  procedure
    ? fromProcedure(procedure)
    : {
        title: '',
        groups: [],
        steps: [{ id: generateUuid(), text: '', detail: null, groupId: null }],
      };

interface StepRowProps {
  draft: ProcedureDraft;
  step: DraftStep;
  position: number;
  isNew: boolean;
  onChange: (next: ProcedureDraft) => void;
  onOpenActions: (stepId: string) => void;
}

function StepRow({
  draft,
  step,
  position,
  isNew,
  onChange,
  onOpenActions,
}: StepRowProps) {
  return (
    <li className='flex items-start gap-1 py-1.5 pr-1 pl-3'>
      <div className='min-w-0 flex-1 py-1'>
        <Textarea
          aria-label={HELM_COPY.procedureStepField}
          variant='outline'
          rows={1}
          autoExpand
          className='max-h-[calc(6lh+1rem)] w-full overflow-y-auto'
          value={step.text}
          maxLength={PROCEDURE_STEP_TEXT_CAP}
          placeholder={HELM_COPY.procedureStepPlaceholder}
          autoFocus={isNew && canFocusFieldOnOpen()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          onChange={(event) =>
            onChange(
              updateStep(draft, step.id, {
                text: event.target.value.replace(/\s*\n\s*/g, ' '),
              }),
            )
          }
        />
        {step.detail && (
          <p className='text-muted-foreground mt-1 truncate text-[13px]'>
            {step.detail}
          </p>
        )}
      </div>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label={HELM_COPY.procedureStepActions(position)}
        className={ICON_BUTTON}
        onClick={() => onOpenActions(step.id)}
      >
        <Ellipsis className='size-4' aria-hidden='true' />
      </Button>
    </li>
  );
}

function AddStepButton({
  draft,
  groupId,
  onAdd,
}: {
  draft: ProcedureDraft;
  groupId: string | null;
  onAdd: (groupId: string | null) => void;
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
    <div className='flex flex-wrap gap-2'>
      <RevealChip
        icon={<Plus className='size-4' aria-hidden='true' />}
        onClick={() => onAdd(groupId)}
      >
        {HELM_COPY.procedureAddStep}
      </RevealChip>
    </div>
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
  const [actionsStepId, setActionsStepId] = useState<string | null>(null);
  const [newStepId, setNewStepId] = useState<string | null>(null);
  const content = toContent(draft);
  const isReady = content.title !== '' && content.steps.length > 0;

  const change = (next: ProcedureDraft) => {
    setDraft(next);
    onDirtyChange(true);
  };

  const edit = (apply: (current: ProcedureDraft) => ProcedureDraft) => {
    setDraft(apply);
    onDirtyChange(true);
  };

  const add = (groupId: string | null) => {
    const id = generateUuid();
    setNewStepId(id);
    change(addStep(draft, id, groupId));
  };

  const dropGroup = (groupId: string) => {
    const group = draft.groups.find((entry) => entry.id === groupId);
    if (!group) return;
    const at = draft.groups.indexOf(group);
    const heldIds = draft.steps
      .filter((step) => step.groupId === groupId)
      .map((step) => step.id);
    change(removeGroup(draft, groupId));
    if (heldIds.length === 0) return;
    addToast({
      title: HELM_COPY.procedureGroupRemoved(
        group.name || HELM_COPY.procedureGroupFallback,
      ),
      type: 'info',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          edit((current) => restoreGroup(current, group, at, heldIds)),
      },
    });
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
  const actionsStep =
    draft.steps.find((step) => step.id === actionsStepId) ?? null;

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
                <EllipsisDropdown
                  variant='tertiary'
                  ariaLabel={HELM_COPY.procedureGroupActions(
                    block.name || HELM_COPY.procedureGroupFallback,
                  )}
                  className={ICON_BUTTON}
                  items={[
                    option({
                      label: HELM_COPY.procedureRemoveGroup,
                      value: 'remove',
                    }),
                  ]}
                  onItemSelect={() => dropGroup(block.groupId as string)}
                />
              </div>
            )}
            {steps.length > 0 && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {steps.map((step) => (
                  <StepRow
                    key={step.id}
                    draft={draft}
                    step={step}
                    position={ordered.indexOf(step) + 1}
                    isNew={step.id === newStepId}
                    onChange={change}
                    onOpenActions={setActionsStepId}
                  />
                ))}
              </ul>
            )}
            <AddStepButton draft={draft} groupId={block.groupId} onAdd={add} />
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
        <Button type='button' variant='tertiary' onClick={requestClose}>
          {HELM_COPY.procedureRacedClose}
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
      {actionsStep && (
        <ProcedureStepSheet
          draft={draft}
          step={actionsStep}
          onChange={change}
          onClose={() => setActionsStepId(null)}
        />
      )}
    </div>
  );
}

/** Make a procedure or change one: a title, steps in groups the person names, each step's own menu moving, detailing or removing it, up to 60 steps. */
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
    <FormScreen
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
    </FormScreen>
  );
}

export default ProcedureForm;
