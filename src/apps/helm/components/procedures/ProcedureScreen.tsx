import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { formatDateShort } from '@/utils/formatUtils';
import ProcedureForm from '@apps/helm/components/procedures/ProcedureForm';
import ProcedureVersionsSheet from '@apps/helm/components/procedures/ProcedureVersionsSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY, PROCEDURE_FOLD_FROM } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  deleteProcedure,
  type ProcedureRestore,
} from '@apps/helm/store/actions/procedureActions';
import { isUnavailable } from '@apps/helm/store/actions/topicActions';
import { selectProcedureById } from '@apps/helm/store/selectors/procedureSelectors';
import { toProcedureMarkdown } from '@apps/helm/utils/procedureMarkdown';
import { countSteps, groupSteps } from '@apps/helm/utils/stepGroups';

const { option, separator, custom } = DropdownMenuFactories;

interface ProcedureScreenProps {
  procedureId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
}

/** One procedure: its steps in their groups, with Edit under its title and a menu for its history, a Markdown copy and Delete. */
function ProcedureScreen({
  procedureId,
  backLabel,
  onBack,
  onHome,
}: ProcedureScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const assistant = useAssistantName();
  const isLoaded = useAppSelector((state) => state.helm.procedures.isLoaded);
  const procedure =
    useAppSelector(selectProcedureById).get(procedureId ?? '') ?? null;
  const sourceTask = useAppSelector((state) =>
    procedure?.sourceTaskId
      ? ([...state.helm.openTasks.items, ...state.helm.projectTasks.items].find(
          (task) => task.id === procedure.sourceTaskId,
        )?.title ?? null)
      : null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [openGroupIds, setOpenGroupIds] = useState<string[]>([]);

  useScreenContext(
    'procedure',
    null,
    [],
    {
      ask: HELM_COPY.askAboutProcedure,
      chip: procedure
        ? HELM_COPY.chipProcedure(procedure.title)
        : HELM_COPY.chipProcedures,
      back: procedure
        ? HELM_COPY.backToProcedure(procedure.title)
        : HELM_COPY.backToProcedures,
    },
    'page',
    null,
    procedure?.id ?? null,
  );

  const blocks = procedure ? groupSteps(procedure) : [];
  const stepCount = countSteps(blocks);
  const isFolding = stepCount > PROCEDURE_FOLD_FROM;
  const sourceLine = !procedure
    ? null
    : sourceTask
      ? HELM_COPY.procedureMadeFrom(sourceTask)
      : procedure.createdBy === 'nomos'
        ? HELM_COPY.procedureMadeBy(assistant)
        : HELM_COPY.procedureMadeByYou;

  const copy = async () => {
    if (!procedure) return;
    const isCopied = await copyToClipboard(toProcedureMarkdown(procedure));
    addToast(
      isCopied
        ? { title: HELM_COPY.procedureCopied(stepCount), type: 'success' }
        : { title: HELM_COPY.procedureCopyFailed, type: 'error' },
    );
  };

  const putBack =
    (title: string) => (restore: () => Promise<ProcedureRestore>) =>
      void restore().then(
        (outcome) =>
          addToast({
            title:
              outcome === 'exists'
                ? HELM_COPY.restoreExists
                : outcome === 'offline'
                  ? HELM_COPY.procedureNeedsConnection
                  : HELM_COPY.procedureDeletedBack(title),
            type: 'info',
          }),
        (error: unknown) => {
          console.error('Helm deleted procedure was not restored', error);
          addToast({ title: HELM_COPY.procedureUndoFailed, type: 'error' });
        },
      );

  const remove = async () => {
    if (!user || !procedure) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.procedureNeedsConnection, type: 'info' });
      return;
    }
    const isConfirmed = await confirm({
      title: HELM_COPY.procedureDeleteTitle(procedure.title),
      message: HELM_COPY.procedureDeleteConfirm,
      confirmText: HELM_COPY.procedureDelete,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { restore } = await deleteProcedure(user.uid, procedure.id);
      onBack();
      addToast({
        title: HELM_COPY.procedureDeleted(
          procedure.title || HELM_COPY.procedureUntitled,
        ),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () => putBack(procedure.title)(restore),
        },
      });
    } catch (error) {
      console.error('Helm procedure was not deleted', error);
      addToast({
        title: isUnavailable(error)
          ? HELM_COPY.procedureNeedsConnection
          : HELM_COPY.procedureDeleteFailed,
        type: isUnavailable(error) ? 'info' : 'error',
      });
    }
  };

  const menu = procedure
    ? {
        items: [
          option({ label: HELM_COPY.procedureHistory, value: 'history' }),
          option({ label: HELM_COPY.procedureCopy, value: 'copy' }),
          separator(),
          custom(() => (
            <Button
              type='button'
              variant='tertiary'
              className='text-destructive! hover:bg-destructive/10 w-full justify-start gap-2 rounded-none px-3 py-2 text-sm'
              onClick={() => void remove()}
            >
              <Trash2 className='size-4' aria-hidden='true' />
              {HELM_COPY.procedureDelete}
            </Button>
          )),
        ],
        onItemSelect: (value: string) => {
          if (value === 'history') setIsHistoryOpen(true);
          else if (value === 'copy') void copy();
        },
      }
    : undefined;

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={onBack}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !procedure && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.procedureGone}
          </p>
        )}
        {procedure && (
          <>
            <div className='space-y-1'>
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                {procedure.title || HELM_COPY.procedureUntitled}
              </h1>
              {sourceLine && (
                <p className='text-muted-foreground text-[13px] break-words'>
                  {HELM_COPY.procedureFacts(stepCount, sourceLine)}
                </p>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => setIsEditing(true)}
              >
                <Pencil className='size-4' aria-hidden='true' />
                {HELM_COPY.procedureEdit}
              </Button>
              {procedure.version > 1 && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className="text-muted-foreground relative max-w-full min-w-0 gap-1 text-[13px] font-normal before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
                  onClick={() => setIsHistoryOpen(true)}
                >
                  <span className='truncate'>
                    {HELM_COPY.procedureChanged(
                      formatDateShort(
                        procedure.lastEditedAt ?? procedure.createdAt,
                      ),
                    )}
                  </span>
                  <ChevronRight
                    className='size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              )}
            </div>
            {blocks.map((block) => {
              const isFolded =
                isFolding &&
                block.groupId !== null &&
                !openGroupIds.includes(block.groupId);
              return (
                <section
                  key={block.groupId ?? 'ungrouped'}
                  className='space-y-2'
                >
                  {block.groupId !== null &&
                    block.name !== null &&
                    (isFolding ? (
                      <Button
                        type='button'
                        variant='tertiary'
                        className='text-foreground flex h-auto w-full min-w-0 items-center justify-between gap-2 px-0! py-1 text-left text-[15px] font-semibold'
                        onClick={() =>
                          setOpenGroupIds((ids) =>
                            ids.includes(block.groupId as string)
                              ? ids.filter((id) => id !== block.groupId)
                              : [...ids, block.groupId as string],
                          )
                        }
                      >
                        <span className='min-w-0 break-words'>
                          {HELM_COPY.procedureGroupShow(
                            block.name,
                            block.steps.length,
                          )}
                        </span>
                        {isFolded ? (
                          <ChevronRight
                            className='size-4 shrink-0'
                            aria-hidden='true'
                          />
                        ) : (
                          <ChevronDown
                            className='size-4 shrink-0'
                            aria-hidden='true'
                          />
                        )}
                      </Button>
                    ) : (
                      <h2 className='text-foreground text-[15px] leading-[21px] font-semibold break-words'>
                        {HELM_COPY.procedureGroupShow(
                          block.name,
                          block.steps.length,
                        )}
                      </h2>
                    ))}
                  {!isFolded && (
                    <ul className='helm-card divide-border divide-y overflow-hidden'>
                      {block.steps.map((step) => (
                        <li key={step.id} className='px-4 py-3'>
                          <p className='text-foreground text-[15px] leading-[21px] break-words'>
                            {step.text}
                          </p>
                          {step.detail && (
                            <p className='text-muted-foreground text-[13px] break-words whitespace-pre-line'>
                              {step.detail}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}
      </main>
      {procedure && (
        <>
          <ProcedureForm
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            procedure={procedure}
          />
          <ProcedureVersionsSheet
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            procedure={procedure}
          />
        </>
      )}
    </>
  );
}

export default ProcedureScreen;
