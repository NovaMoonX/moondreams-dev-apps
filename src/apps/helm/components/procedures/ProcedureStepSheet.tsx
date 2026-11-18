import { useState } from 'react';

import { Select, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import Drawer from '@/components/Drawer';
import OptionalDetailRows from '@/components/forms/OptionalDetailRows';
import RevealChip from '@/components/RevealChip';
import { HELM_COPY, PROCEDURE_STEP_DETAIL_CAP } from '@apps/helm/constants';
import {
  canMoveStep,
  moveStep,
  removeStep,
  setStepGroup,
  updateStep,
  type DraftStep,
  type ProcedureDraft,
} from '@apps/helm/utils/procedureDraft';

const NO_GROUP = 'none';
const DETAIL = 'detail';

interface ProcedureStepSheetProps {
  draft: ProcedureDraft;
  step: DraftStep;
  onChange: (next: ProcedureDraft) => void;
  onClose: () => void;
}

/** One step's own actions: its detail, the group it sits in, where it sits in that group, and Remove. */
function ProcedureStepSheet({
  draft,
  step,
  onChange,
  onClose,
}: ProcedureStepSheetProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <Drawer isOpen onClose={onClose} title={HELM_COPY.procedureStepSheetTitle}>
      <div className='space-y-4 pb-4'>
        <OptionalDetailRows
          heading={HELM_COPY.procedureStepDetailHeading}
          openKey={openKey}
          onOpen={setOpenKey}
          onClose={() => setOpenKey(null)}
          onRemove={() =>
            onChange(updateStep(draft, step.id, { detail: null }))
          }
          details={[
            {
              key: DETAIL,
              label: HELM_COPY.procedureStepDetailRow,
              value: step.detail,
              isEmpty: step.detail === null,
              render: () => (
                <Textarea
                  aria-label={HELM_COPY.procedureDetailField}
                  variant='outline'
                  rows={2}
                  autoExpand
                  className='max-h-[calc(6lh+1rem)] overflow-y-auto'
                  value={step.detail ?? ''}
                  maxLength={PROCEDURE_STEP_DETAIL_CAP}
                  placeholder={HELM_COPY.procedureStepDetail}
                  onChange={(event) =>
                    onChange(
                      updateStep(draft, step.id, {
                        detail:
                          event.target.value === '' ? null : event.target.value,
                      }),
                    )
                  }
                />
              ),
            },
          ]}
        />
        {step.detail === null && openKey === null && (
          <div className='flex flex-wrap gap-2'>
            <RevealChip
              icon={<Plus className='size-4' aria-hidden='true' />}
              onClick={() => setOpenKey(DETAIL)}
            >
              {HELM_COPY.procedureStepDetail}
            </RevealChip>
          </div>
        )}
        {draft.groups.length > 0 && (
          <div className='space-y-1.5'>
            <p className='text-sm font-medium'>
              {HELM_COPY.procedureMoveToGroup}
            </p>
            <Select
              aria-label={HELM_COPY.procedureMoveToGroup}
              className='h-10 min-h-10'
              options={[
                { value: NO_GROUP, text: HELM_COPY.procedureNoGroup },
                ...draft.groups.map((group) => ({
                  value: group.id,
                  text: group.name || HELM_COPY.procedureGroupFallback,
                })),
              ]}
              value={step.groupId ?? NO_GROUP}
              onChange={(value) => {
                onChange(
                  setStepGroup(
                    draft,
                    step.id,
                    value === NO_GROUP ? null : value,
                  ),
                );
                onClose();
              }}
            />
          </div>
        )}
        <ActionGroup>
          <ActionRow
            isGrouped
            icon={<ArrowUp aria-hidden='true' />}
            label={HELM_COPY.procedureMoveUp}
            isDisabled={!canMoveStep(draft, step.id, 'up')}
            onClick={() => onChange(moveStep(draft, step.id, 'up'))}
          />
          <ActionRow
            isGrouped
            icon={<ArrowDown aria-hidden='true' />}
            label={HELM_COPY.procedureMoveDown}
            isDisabled={!canMoveStep(draft, step.id, 'down')}
            onClick={() => onChange(moveStep(draft, step.id, 'down'))}
          />
        </ActionGroup>
        <ActionGroup>
          <ActionRow
            isGrouped
            isDestructive
            icon={<Trash2 aria-hidden='true' />}
            label={HELM_COPY.procedureRemoveStep}
            onClick={() => {
              onChange(removeStep(draft, step.id));
              onClose();
            }}
          />
        </ActionGroup>
      </div>
    </Drawer>
  );
}

export default ProcedureStepSheet;
