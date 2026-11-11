import { useState } from 'react';

import {
  Button,
  Checkbox,
  DropdownMenuFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Plus, Trash2 } from 'lucide-react';

import ChecklistGroup, { TICK_HIT_CLASS } from '@/components/ChecklistGroup';
import LockedButton from '@/components/LockedButton';
import TickMark from '@/components/TickMark';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { formatDateShort, formatDateShortUTC } from '@/utils/formatUtils';
import {
  RunExtraSheet,
  RunStepRow,
} from '@apps/helm/components/procedures/RunRows';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import {
  HELM_COPY,
  PROCEDURE_STEPS_MAX,
  RUN_EXTRA_TEXT_CAP,
} from '@apps/helm/constants';
import { useRun } from '@apps/helm/hooks/useRun';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { addStepFromRun } from '@apps/helm/store/actions/procedureActions';
import {
  addExtraStep,
  deleteRun,
  finishRun,
  reopenRun,
  tickRunSteps,
  type ExtraResult,
} from '@apps/helm/store/actions/runActions';
import { selectProcedureById } from '@apps/helm/store/selectors/procedureSelectors';
import { toTaskTitle } from '@apps/helm/utils/heldCaptures';
import {
  getDoneCount,
  getRunBlocks,
  getRunProgress,
  hasStepWithText,
  type RunStep,
} from '@apps/helm/utils/runSteps';
import { countSteps, groupSteps } from '@apps/helm/utils/stepGroups';

const { option } = DropdownMenuFactories;

interface RunScreenProps {
  runId: string | null;
  /** The page the run was opened from, when the history knows it; null after a reload. */
  originLabel: string | null;
  onBackToOrigin: () => void;
  /** Back with no opener: to the run's procedure, or to Procedures when it is gone. */
  onBackUp: (procedureId: string | null) => void;
  onHome: () => void;
}

/** One run: its steps in the groups it started with, each ticked on its own, with the steps added just this time and Finish at the foot. */
function RunScreen({
  runId,
  originLabel,
  onBackToOrigin,
  onBackUp,
  onHome,
}: RunScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const isOffline = useNetworkStatus() === 'offline';
  const { run, isLoaded, hasFailed } = useRun(runId);
  const procedures = useAppSelector((state) => state.helm.procedures);
  const procedure = useAppSelector(selectProcedureById).get(
    run?.procedureId ?? '',
  );
  const synced = useAppSelector((state) => state.helm.synced);
  const [draft, setDraft] = useState('');
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [isSavingExtra, setIsSavingExtra] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);

  const title = run ? run.title || HELM_COPY.runUntitled : '';
  useScreenContext(
    'run',
    null,
    [],
    {
      ask: HELM_COPY.askAboutRun,
      chip: title ? HELM_COPY.chipRun(title) : HELM_COPY.runsHeading,
      back: title ? HELM_COPY.backToRun(title) : HELM_COPY.backToProcedures,
    },
    'page',
    null,
    null,
    run?.id ?? null,
  );

  const isFinished = run !== null && run.finishedAt !== null;
  const { blocks, extras } = run
    ? getRunBlocks(run)
    : { blocks: [], extras: [] as RunStep[] };
  const { done, total } = run ? getRunProgress(run) : { done: 0, total: 0 };
  const allSteps = [...blocks.flatMap((block) => block.steps), ...extras];
  const hasSeveralGroups = blocks.length + (extras.length > 0 ? 1 : 0) > 1;
  const openStep = extras.find((step) => step.id === openStepId) ?? null;
  const back = originLabel
    ? onBackToOrigin
    : () => onBackUp(procedure?.id ?? null);
  const backLabel =
    originLabel ??
    (procedure
      ? HELM_COPY.backToProcedure(
          procedure.title || HELM_COPY.procedureUntitled,
        )
      : HELM_COPY.backToProcedures);

  const attachment = run?.attachedTo ?? null;
  const isLeftCalendar =
    attachment?.kind === 'synced' &&
    synced.isLoaded &&
    !synced.items.some((record) => record.id === attachment.id);
  const forLine =
    run?.attachedLabel == null
      ? null
      : isLeftCalendar
        ? HELM_COPY.runNoLongerOnCalendar(
            run.attachedLabel,
            run.dueOn === null
              ? formatDateShort(run.startedAt)
              : formatDateShortUTC(run.dueOn),
          )
        : HELM_COPY.runFor(
            run.attachedLabel,
            run.dueOn === null ? null : formatDateShortUTC(run.dueOn),
          );

  const reportFailure = (message: string) => (error: unknown) => {
    console.error('Helm run was not changed', error);
    addToast({ title: message, type: 'error' });
  };

  const tick = (stepIds: string[], isDone: boolean) => {
    if (!user || !run || stepIds.length === 0) return;
    tickRunSteps(user.uid, run.id, stepIds, isDone).catch(
      reportFailure(HELM_COPY.runTickFailed),
    );
  };

  const tickMany =
    (steps: { id: string; doneAt: number | null }[]) => (isDone: boolean) =>
      tick(
        steps
          .filter((step) => (step.doneAt !== null) !== isDone)
          .map((step) => step.id),
        isDone,
      );

  const addExtra = async () => {
    const text = toTaskTitle(draft).slice(0, RUN_EXTRA_TEXT_CAP);
    if (!user || !run || !text || isSavingExtra) return;
    setIsSavingExtra(true);
    setFailure(null);
    const result: ExtraResult | null = await getHelmEncryption(user.uid)
      .then((encryption) => addExtraStep(user.uid, encryption, run.id, text))
      .catch((error: unknown) => {
        console.error('Helm run step was not added', error);
        return null;
      });
    setIsSavingExtra(false);
    if (result?.kind === 'saved') {
      setDraft('');
      setIsAddingExtra(false);
      return;
    }
    setFailure(
      result?.kind === 'offline'
        ? HELM_COPY.runNeedsConnection
        : result?.kind === 'full'
          ? HELM_COPY.runExtraFull
          : result?.kind === 'unreadable'
            ? HELM_COPY.runUnreadable
            : HELM_COPY.wordsSaveFailed,
    );
  };

  const addToProcedure = async (step: RunStep) => {
    if (!user || !procedure) return;
    if (countSteps(groupSteps(procedure)) >= PROCEDURE_STEPS_MAX) {
      addToast({ title: HELM_COPY.procedureStepsFull, type: 'info' });
      return;
    }
    const outcome = await getHelmEncryption(user.uid)
      .then((encryption) =>
        addStepFromRun(
          user.uid,
          encryption,
          procedure.id,
          procedure.version,
          step.text,
        ),
      )
      .catch((error: unknown) => {
        console.error('Helm step was not added to the procedure', error);
        return 'failed' as const;
      });
    addToast({
      title:
        outcome === 'saved'
          ? HELM_COPY.runAddedToProcedure(
              procedure.title || HELM_COPY.procedureUntitled,
            )
          : outcome === 'offline'
            ? HELM_COPY.runNeedsConnection
            : outcome === 'changed'
              ? HELM_COPY.procedureRaced
              : HELM_COPY.runAddToProcedureFailed,
      type: outcome === 'saved' || outcome === 'offline' ? 'success' : 'error',
    });
  };

  const remove = async () => {
    if (!user || !run) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.runDeleteTitle,
      message: HELM_COPY.runDeleteConfirm,
      confirmText: HELM_COPY.runDelete,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { written, restore } = await deleteRun(user.uid, run.id);
      written.catch(reportFailure(HELM_COPY.runDeleteFailed));
      back();
      addToast({
        title: HELM_COPY.runDeleted(title),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restore().then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'exists'
                      ? HELM_COPY.restoreExists
                      : HELM_COPY.runDeletedBack,
                  type: 'info',
                }),
              reportFailure(HELM_COPY.runUndoFailed),
            ),
        },
      });
    } catch (error) {
      reportFailure(HELM_COPY.runDeleteFailed)(error);
    }
  };

  const menu = run
    ? {
        items: [
          option({
            label: HELM_COPY.runDelete,
            value: 'delete',
            icon: (
              <Trash2 className='text-destructive size-4' aria-hidden='true' />
            ),
          }),
        ],
        onItemSelect: (value: string) => {
          if (value === 'delete') void remove();
        },
      }
    : undefined;

  const renderRows = (steps: RunStep[], isExtra: boolean) =>
    steps.map((step) => (
      <RunStepRow
        key={step.id}
        step={step}
        isReadOnly={isFinished}
        onTick={(isDone) => tick([step.id], isDone)}
        onOpen={
          isExtra && !isFinished ? () => setOpenStepId(step.id) : undefined
        }
      />
    ));

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={back}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {hasFailed && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.runFailed}
          </p>
        )}
        {isLoaded && !run && !hasFailed && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.runGone}
          </p>
        )}
        {run && (
          <>
            <div className='space-y-1'>
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                {title}
              </h1>
              {forLine && (
                <p className='text-muted-foreground text-[13px] break-words'>
                  {forLine}
                </p>
              )}
              {procedures.isLoaded && !procedure && (
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.runProcedureGone}
                </p>
              )}
            </div>
            {isFinished && run.finishedAt !== null && (
              <div className='border-border bg-muted/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-2'>
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.runRowDetail(
                    HELM_COPY.runFinished(formatDateShort(run.finishedAt)),
                    done,
                    total,
                  )}
                </p>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => {
                    if (user) {
                      reopenRun(user.uid, run.id).catch(
                        reportFailure(HELM_COPY.editFailed),
                      );
                    }
                  }}
                >
                  {HELM_COPY.runReopen}
                </Button>
              </div>
            )}
            {!isFinished && total > 0 && (
              <div className='border-border bg-card flex min-h-12 items-center gap-3 rounded-2xl border px-3'>
                {done === total ? (
                  <span className='flex w-5 shrink-0 justify-center text-lg'>
                    <TickMark />
                  </span>
                ) : (
                  <Checkbox
                    className={TICK_HIT_CLASS}
                    checked={false}
                    indeterminate={done > 0}
                    onCheckedChange={(next) =>
                      tickMany(allSteps)(Boolean(next))
                    }
                    aria-label={HELM_COPY.runTickAll}
                  />
                )}
                <span className='min-w-0 flex-1 font-medium'>
                  {HELM_COPY.runAllSteps}
                </span>
                <span className='text-muted-foreground text-sm whitespace-nowrap tabular-nums'>
                  {HELM_COPY.runProgress(done, total)}
                </span>
              </div>
            )}
            {blocks.map((block) => (
              <ChecklistGroup
                key={block.groupId ?? 'ungrouped'}
                label={block.name ?? undefined}
                onToggleAll={
                  !isFinished && hasSeveralGroups && block.name !== null
                    ? tickMany(block.steps)
                    : undefined
                }
                doneCount={getDoneCount(block.steps)}
                total={block.steps.length}
              >
                {renderRows(block.steps, false)}
              </ChecklistGroup>
            ))}
            {extras.length > 0 && (
              <ChecklistGroup
                label={HELM_COPY.runJustThisTime}
                onToggleAll={
                  !isFinished && hasSeveralGroups ? tickMany(extras) : undefined
                }
                doneCount={getDoneCount(extras)}
                total={extras.length}
              >
                {renderRows(extras, true)}
              </ChecklistGroup>
            )}
            {!isFinished &&
              (isAddingExtra ? (
                <div className='space-y-2'>
                  <div className='flex items-center gap-2'>
                    <Input
                      variant='outline'
                      aria-label={HELM_COPY.runExtraField}
                      placeholder={HELM_COPY.runExtraPlaceholder}
                      className='helm-field'
                      maxLength={RUN_EXTRA_TEXT_CAP}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void addExtra();
                      }}
                    />
                    {isOffline ? (
                      <LockedButton
                        label={HELM_COPY.runExtraAdd}
                        title={HELM_COPY.runNeedsConnection}
                        className='shrink-0 whitespace-nowrap'
                      >
                        <p>{HELM_COPY.runNeedsConnectionBody}</p>
                      </LockedButton>
                    ) : (
                      <Button
                        type='button'
                        variant='secondary'
                        className='shrink-0 whitespace-nowrap'
                        disabled={isSavingExtra || toTaskTitle(draft) === ''}
                        onClick={() => void addExtra()}
                      >
                        {HELM_COPY.runExtraAdd}
                      </Button>
                    )}
                  </div>
                  {failure && (
                    <p
                      role='alert'
                      className='text-destructive text-sm text-pretty'
                    >
                      {failure}
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  type='button'
                  variant='tertiary'
                  className='gap-2'
                  onClick={() => setIsAddingExtra(true)}
                >
                  <Plus className='size-4' aria-hidden='true' />
                  {HELM_COPY.runAddExtra}
                </Button>
              ))}
            {!isFinished && (
              <div className='space-y-1.5 pt-2'>
                <Button
                  type='button'
                  className='w-full'
                  onClick={() => {
                    if (user) {
                      finishRun(user.uid, run.id).catch(
                        reportFailure(HELM_COPY.editFailed),
                      );
                    }
                  }}
                >
                  {HELM_COPY.runFinish}
                </Button>
                <p className='text-muted-foreground text-center text-[13px]'>
                  {HELM_COPY.runFinishHint}
                </p>
              </div>
            )}
          </>
        )}
      </main>
      {run && openStep && (
        <RunExtraSheet
          step={openStep}
          canAddToProcedure={
            procedure !== undefined &&
            !hasStepWithText(procedure, openStep.text)
          }
          onAddToProcedure={() => void addToProcedure(openStep)}
          onClose={() => setOpenStepId(null)}
        />
      )}
    </>
  );
}

export default RunScreen;
