import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AimLengthSheet from '@apps/helm/components/dayCard/AimLengthSheet';
import AimRows from '@apps/helm/components/dayCard/AimRows';
import FoldedLine from '@apps/helm/components/dayCard/FoldedLine';
import MorningCard from '@apps/helm/components/dayCard/MorningCard';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import WindDownCard from '@apps/helm/components/dayCard/WindDownCard';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { AimRow, useDayCard } from '@apps/helm/hooks/useDayCard';
import { usePlanDay } from '@apps/helm/hooks/usePlanDays';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import {
  bringAimToToday,
  fileAims,
  finishWindDown,
  fixAimLength,
  leaveAimOffToday,
  setMorningState,
  setWindDownEntry,
  type DayAimsChange,
} from '@apps/helm/store/actions/dayAimsActions';
import type { StruggleSignal } from '@apps/helm/types';
import { foldedAimsLine, readWindDownCounts } from '@apps/helm/utils/dayCard';
import { UNDO_WINDOW_MS } from '@/lib/undo';

// Plans already tried this session for a day's aims, so a plan that fails never loops.
const attempted = new Set<string>();

/** Home's day card: in the morning it asks what the person wants done and carries yesterday's leftovers; once answered it is one folded line; in the last 2 hours it winds the day down. The server turns the day over while the app is closed, so the card is already right when it opens. */
function DayCard({ card }: { card: ReturnType<typeof useDayCard> }) {
  const name = useAssistantName();
  const { addToast } = useToast();
  const { uid, model, filing } = card;
  const { held, tick, undoTick } = useTaskTicks(uid);
  const { plan, isReady, isWaitingForServer, isFailing } = usePlanDay();
  const [unfolded, setUnfolded] = useState<string | null>(null);
  const [lengthRow, setLengthRow] = useState<AimRow | null>(null);
  const [failedPlanKey, setFailedPlanKey] = useState<string | null>(null);
  const { showView } = useHelmUrlState();
  const openToday = () => void showView('today');
  const heldIds = new Set(held.keys());

  const todayKey = model?.todayKey ?? '';
  const mode = model?.mode ?? 'hidden';
  const wanted = model?.wanted ?? [];
  const planKey = `${uid}|${todayKey}|${wanted.map((row) => row.taskId).join(',')}`;
  const isPlanDue =
    isReady &&
    !isFailing &&
    uid !== null &&
    wanted.some(
      (row) => row.slotId === null && !row.doesntFit && !row.isDone,
    ) &&
    (mode === 'answered' || mode === 'ask');
  const isPlanFailed = failedPlanKey === planKey;

  useEffect(() => {
    if (!isPlanDue || isWaitingForServer(todayKey) || attempted.has(planKey))
      return;
    attempted.add(planKey);
    void plan(todayKey, false, true).then((result) => {
      if (result === 'failed') setFailedPlanKey(planKey);
    });
  }, [isPlanDue, isWaitingForServer, planKey, plan, todayKey]);

  if (!model || !uid || mode === 'hidden') return null;

  const fail = (error: unknown) => {
    console.error('Helm day card did not save', error);
    addToast({ title: HELM_COPY.dayAimsSaveFailed, type: 'error' });
  };
  const apply = (start: () => Promise<DayAimsChange>, title: string) =>
    start()
      .then((change) => {
        addToast({
          duration: UNDO_WINDOW_MS,
          title,
          type: 'info',
          action: {
            label: HELM_COPY.undo,
            onClick: () => void change.undo().catch(fail),
          },
        });
        return change.write;
      })
      .catch(fail);

  const foldKey = `${todayKey}|${mode}`;
  const isUnfolded = unfolded === foldKey;
  const toggleFold = () => setUnfolded(isUnfolded ? null : foldKey);
  const fixLength = async (minutes: number) => {
    if (!lengthRow) return;
    const row = lengthRow;
    await apply(
      () =>
        fixAimLength(uid, {
          dayKey: todayKey,
          taskId: row.taskId,
          minutes,
          previousMinutes: row.minutes,
          wasGuess: row.minutes === null,
        }),
      HELM_COPY.dayAimsLengthSaved(row.title, `${minutes} min`),
    );
  };
  const aimRows = (
    <AimRows
      rows={model.wanted}
      fitLine={model.fitLine}
      isRest={model.isRest}
      heldIds={heldIds}
      onTick={tick}
      onUndoTick={(taskId) => void undoTick(taskId)}
      onFixLength={setLengthRow}
      onOpenToday={openToday}
    />
  );
  const sheet = lengthRow && (
    <AimLengthSheet
      title={lengthRow.title}
      guessedMinutes={lengthRow.guessMinutes ?? 30}
      onSave={fixLength}
      onClose={() => setLengthRow(null)}
    />
  );

  if (mode === 'ask') {
    return (
      <>
        <MorningCard
          rows={model.wanted}
          carry={model.carry}
          fitLine={model.fitLine}
          isRest={model.isRest}
          filing={filing}
          isPlanFailed={isPlanFailed}
          heldIds={heldIds}
          onSend={async (text) => {
            try {
              await fileAims(uid, {
                text,
                dayKey: todayKey,
                assistantName: name,
              });
              return true;
            } catch (error) {
              console.error('Helm aims were not sent', error);
              addToast({ title: HELM_COPY.sendFailed, type: 'error' });
              return false;
            }
          }}
          onBring={(row) =>
            void apply(
              () =>
                bringAimToToday(uid, {
                  todayKey,
                  fromKey: model.yesterdayKey,
                  taskId: row.taskId,
                  hasLength: row.minutes !== null,
                }),
              HELM_COPY.dayAimsBrought(row.title),
            )
          }
          onLeaveOff={(row) =>
            void apply(
              () => leaveAimOffToday(uid, model.yesterdayKey, row.taskId),
              HELM_COPY.dayAimsLeftOff(row.title),
            )
          }
          onSkip={() =>
            void apply(
              () => setMorningState(uid, todayKey, 'dismissed'),
              HELM_COPY.dayAimsSkippedToast,
            )
          }
          onTick={tick}
          onUndoTick={(taskId) => void undoTick(taskId)}
          onFixLength={setLengthRow}
          onOpenToday={openToday}
          onRetryPlan={() => {
            attempted.delete(planKey);
            setFailedPlanKey(null);
          }}
        />
        {sheet}
      </>
    );
  }

  if (mode === 'skipped') {
    return (
      <section className='border-border border-b py-1'>
        <p className='text-muted-foreground pt-3 text-[15px]'>
          {HELM_COPY.dayAimsSkipped}
        </p>
        <Button
          type='button'
          variant='tertiary'
          className='h-11 px-0! text-[15px] font-normal'
          onClick={() =>
            void setMorningState(uid, todayKey, 'open').catch(fail)
          }
        >
          {HELM_COPY.dayAimsSayIt}
        </Button>
      </section>
    );
  }

  if (mode === 'answered') {
    return (
      <section className='border-border border-b'>
        <FoldedLine
          text={foldedAimsLine(model.wanted.length, model.plannedCount)}
          isOpen={isUnfolded}
          label={isUnfolded ? HELM_COPY.dayAimsHide : HELM_COPY.dayAimsOpen}
          onToggle={toggleFold}
        />
        {isUnfolded && (
          <div className='pb-3'>
            {aimRows}
            {isPlanFailed && (
              <div className='space-y-2 pt-2'>
                <p className='text-[15px] text-pretty'>
                  {HELM_COPY.dayAimsPlanFailed}
                </p>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => {
                    attempted.delete(planKey);
                    setFailedPlanKey(null);
                  }}
                >
                  {HELM_COPY.dayAimsTryAgain}
                </Button>
              </div>
            )}
          </div>
        )}
        {sheet}
      </section>
    );
  }

  const windDown = (
    <WindDownCard
      rows={model.rows}
      heldIds={heldIds}
      isReview={mode === 'wound'}
      onChoose={(row, choice) =>
        void apply(
          () =>
            setWindDownEntry(uid, {
              dayKey: todayKey,
              taskId: row.taskId,
              result: row.result,
              choice,
            }),
          HELM_COPY.windDownChose(row.title, choice),
        )
      }
      onReason={(row, reason: StruggleSignal | null) =>
        void apply(
          () =>
            setWindDownEntry(uid, {
              dayKey: todayKey,
              taskId: row.taskId,
              result: row.result,
              reason,
            }),
          HELM_COPY.windDownReasonSaved(
            reason ? HELM_COPY.dayAimsStruggle[reason] : null,
          ),
        )
      }
      onFinish={() =>
        void apply(
          () =>
            finishWindDown(uid, {
              dayKey: todayKey,
              results: Object.fromEntries(
                model.rows.map((row) => [row.taskId, row.result]),
              ),
            }),
          model.today
            ? HELM_COPY.windDownSummary(
                readWindDownCounts(
                  model.today,
                  (taskId) =>
                    model.rows.find((row) => row.taskId === taskId)?.isDone ??
                    false,
                ),
              )
            : HELM_COPY.windDownFinish,
        )
      }
      onTick={tick}
      onUndoTick={(taskId) => void undoTick(taskId)}
      onFixLength={setLengthRow}
    />
  );

  if (mode === 'wound' && model.today) {
    const summary = HELM_COPY.windDownSummary(
      readWindDownCounts(
        model.today,
        (taskId) =>
          model.rows.find((row) => row.taskId === taskId)?.isDone ?? false,
      ),
    );
    return (
      <section className='border-border border-b'>
        <FoldedLine
          text={summary}
          isOpen={isUnfolded}
          label={HELM_COPY.windDownReview}
          onToggle={toggleFold}
        />
        {isUnfolded && <div className='pb-3'>{windDown}</div>}
        {sheet}
      </section>
    );
  }

  return (
    <>
      {windDown}
      {sheet}
    </>
  );
}

export default DayCard;
