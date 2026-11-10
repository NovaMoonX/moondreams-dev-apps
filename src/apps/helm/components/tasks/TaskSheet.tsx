import { useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Hourglass } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import ShowMoreButton from '@/components/ShowMoreButton';
import SummaryRow from '@/components/SummaryRow';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  PlacementBody,
  PlacementFooter,
} from '@apps/helm/components/today/Placement';
import AskAboutThisControl from '@apps/helm/components/shell/AskAboutThisControl';
import TaskDetails, {
  WhenRow,
  WordsEditor,
  type TaskEditing,
  type WordsOutcome,
} from '@apps/helm/components/tasks/TaskDetails';
import TaskSteps, { TickButton } from '@apps/helm/components/tasks/TaskSteps';
import WaitsOnPicker from '@apps/helm/components/tasks/WaitsOnPicker';
import {
  HELM_COPY,
  NOTES_MAX_CHARS,
  TASK_TITLE_CAP,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  useLinkedNames,
  type LinkedName,
} from '@apps/helm/hooks/useLinkedNames';
import { usePlacementMode } from '@apps/helm/hooks/usePlacementMode';
import { usePlanSources } from '@apps/helm/hooks/usePlanDays';
import {
  useScreenContext,
  type ContentView,
} from '@apps/helm/hooks/useScreenContext';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { addKeptSlot } from '@apps/helm/store/actions/planActions';
import {
  deleteTask,
  updateTaskFields,
  updateTaskWords,
  type RestoreResult,
} from '@apps/helm/store/actions/taskActions';
import { selectProjectById } from '@apps/helm/store/selectors/projectSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type {
  OpenTask,
  TaskActivity,
  TaskPlainFields,
  RecordRef,
  TaskWordsChange,
} from '@apps/helm/types';
import { toTaskTitle } from '@apps/helm/utils/heldCaptures';
import {
  formatDayWord,
  formatLength,
  formatSlotRange,
  shiftDayKey,
  toDayKey,
} from '@apps/helm/utils/planDays';
import {
  getOpenings,
  toPlannerTask,
  type Opening,
} from '@apps/helm/utils/planInput';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';
import { getOrderedSteps } from '@apps/helm/utils/taskEdits';

interface TaskSheetProps {
  /** The live task, or a copy held while it is done. Null keeps the sheet closed. */
  task: OpenTask | null;
  /** When it was marked done, while held. */
  doneAt: number | null;
  activity: TaskActivity | null;
  /** The list the sheet is open over, which stays what "these" means beside the one task. */
  screen: { view: ContentView; visible: RecordRef[] };
  onClose: () => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
  onDeleted: (
    taskId: string,
    title: string,
    restore: () => Promise<RestoreResult>,
  ) => void;
}

type View =
  'main' | 'steps' | 'waits' | 'title' | 'notes' | 'plan' | `step:${string}`;

/** Words just saved, shown until the store carries them. */
interface Held<T> {
  taskId: string;
  from: T;
  text: T;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOT = 'px-6 pt-2 pb-3';
const SMALL_ACTION =
  "text-foreground! relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']";

const getLinkedLabel = (kind: LinkedName['kind']) =>
  kind === 'person'
    ? HELM_COPY.linkedPerson
    : kind === 'pet'
      ? HELM_COPY.linkedPet
      : kind === 'organization'
        ? HELM_COPY.linkedOrganization
        : HELM_COPY.linkedPlace;

const readHeld = <T,>(held: Held<T> | null, taskId: string, current: T) =>
  held && held.taskId === taskId && held.from === current ? held.text : current;

const getDoneLine = (doneAt: number, now: number) => {
  const day = toLocalDateInputValue(doneAt);
  const dayWord =
    day === toLocalDateInputValue(now)
      ? 'today'
      : day === toLocalDateInputValue(now - DAY_MS)
        ? 'yesterday'
        : formatDateShort(doneAt);
  return HELM_COPY.doneAt(dayWord, formatTime(doneAt));
};

interface ConditionLineProps {
  text: string;
  actionLabel: string;
  onAction: () => void;
}

function ConditionLine({ text, actionLabel, onAction }: ConditionLineProps) {
  return (
    <div className='bg-muted text-muted-foreground flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm'>
      <Hourglass className='size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 text-pretty'>{text}</span>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className={SMALL_ACTION}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function PublishTaskScreen({
  taskId,
  title,
  screen,
}: {
  taskId: string;
  title: string;
  screen: TaskSheetProps['screen'];
}) {
  useScreenContext(
    screen.view,
    { collection: 'tasks', id: taskId },
    screen.visible,
    {
      ask: HELM_COPY.askTask,
      chip: HELM_COPY.chipAbout(title),
      back: HELM_COPY.backToTask,
    },
    'sheet',
  );
  return null;
}

/** One task: its words, day and steps, and the fields most tasks leave empty. Plain fields save as they change; words save on their own Done and need a connection. */
function TaskSheet({
  task,
  doneAt,
  activity,
  screen,
  onClose,
  onTick,
  onUndoTick,
  onDeleted,
}: TaskSheetProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const isOffline = useNetworkStatus() === 'offline';
  const nowMinute = Math.floor(useNow(MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  const split = useAppSelector((state) => selectTaskActivity(state, nowMinute));
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [nav, setNav] = useState<{ taskId: string; view: View } | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [heldTitle, setHeldTitle] = useState<Held<string> | null>(null);
  const [heldNotes, setHeldNotes] = useState<Held<string | null> | null>(null);
  const [isWordsDirty, setIsWordsDirty] = useState(false);
  const isDeleting = useRef(false);
  const assistantName = useAssistantName();
  const { showView } = useHelmUrlState();
  const linked = useLinkedNames(task ?? { whoIds: [], placeIds: [] });
  const taskProject = useAppSelector(selectProjectById).get(
    task?.projectId ?? '',
  );
  const [planMode, setPlanMode] = usePlacementMode();
  const sources = usePlanSources(nowMinute);
  const plannedKey = useAppSelector((state) => {
    const zone = state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
    const todayKey = toDayKey(Date.now(), zone);
    return (
      Object.entries(state.helm.planDays.byId)
        .filter(
          ([key, day]) =>
            key >= todayKey &&
            Object.values(day.slots).some(
              (slot) => slot.taskId === task?.id && slot.status !== 'notToday',
            ),
        )
        .map(([key]) => key)
        .sort()
        .at(0) ?? null
    );
  });

  const close = () => {
    setNav(null);
    setHeldTitle(null);
    setHeldNotes(null);
    setIsWordsDirty(false);
    setPlanMode('main');
    onClose();
  };
  const requestClose = useDiscardGuard({
    isDirty: isWordsDirty,
    onClose: close,
  });

  const open = useMemo(
    () => [...split.active, ...split.latent.map((entry) => entry.task)],
    [split],
  );

  if (!task || !uid) {
    return (
      <DetailSheet isOpen={false} onClose={close} title=''>
        {null}
      </DetailSheet>
    );
  }

  const view: View = nav?.taskId === task.id ? nav.view : 'main';
  const go = (next: View) => {
    setIsWordsDirty(false);
    setNav({ taskId: task.id, view: next });
  };
  const title = readHeld(heldTitle, task.id, task.title);
  const notes = readHeld(heldNotes, task.id, task.notes);
  const steps = getOrderedSteps(task);
  const stepId = view.startsWith('step:') ? view.slice(5) : null;
  const step = steps.find((entry) => entry.id === stepId);
  const shownView: View = stepId !== null && !step ? 'steps' : view;
  const isDetailsOpen = detailsFor === task.id;
  const shownTitle = task.isUnreadable ? HELM_COPY.unreadable : title;
  const titleOf = shownTitle || HELM_COPY.taskFormTitle;
  const others = open.filter((entry) => entry.id !== task.id);
  const waitedTasks = task.waitsOnTaskIds
    .map((id) => others.find((entry) => entry.id === id))
    .filter((entry) => entry !== undefined);
  const waiting = others.filter((entry) =>
    entry.waitsOnTaskIds.includes(task.id),
  );
  const candidates = others.filter(
    (entry) => !entry.isUnreadable && !waiting.includes(entry),
  );

  const run = (write: Promise<unknown>) => {
    write.catch((error: unknown) => {
      console.error('Helm task did not save', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
  };
  const saveFields = (fields: TaskPlainFields) =>
    run(updateTaskFields(uid, task.id, fields));
  const saveWords = async (change: TaskWordsChange): Promise<WordsOutcome> => {
    try {
      const encryption = await getHelmEncryption(uid);
      const result = await updateTaskWords(uid, encryption, task.id, change);
      if (result === 'missing') close();
      return result;
    } catch (error) {
      console.error('Helm task words did not save', error);
      return 'failed';
    }
  };
  const editing: TaskEditing = {
    uid,
    task,
    timeZone,
    isOffline,
    saveFields,
    run,
    saveWords,
  };

  const remove = async () => {
    if (isDeleting.current) return;
    isDeleting.current = true;
    try {
      const isConfirmed = await confirm({
        title: HELM_COPY.deleteTaskTitle,
        message: HELM_COPY.deleteTaskBody(waiting.length),
        confirmText: HELM_COPY.deleteConfirm,
        destructive: true,
      });
      if (!isConfirmed) return;
      const { write, restore } = await deleteTask(uid, task.id);
      run(write);
      close();
      onDeleted(task.id, titleOf, restore);
    } catch (error) {
      console.error('Helm task did not delete', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    } finally {
      isDeleting.current = false;
    }
  };

  const getCondition = () => {
    if (doneAt !== null || !activity || activity.kind === 'active') return null;
    if (activity.kind === 'notYet') {
      return (
        <ConditionLine
          text={HELM_COPY.conditionNotUntil(
            formatWeekdayDayUTC(activity.until),
          )}
          actionLabel={HELM_COPY.startItNow}
          onAction={() => saveFields({ notUntil: null })}
        />
      );
    }
    if (activity.onTaskIds.length > 0) {
      const [first] = activity.onTaskIds
        .map((id) => others.find((entry) => entry.id === id))
        .filter((entry) => entry !== undefined);
      return (
        <ConditionLine
          text={HELM_COPY.conditionWaitsOnTask(
            (first && !first.isUnreadable && first.title) ||
              HELM_COPY.unreadable,
            activity.onTaskIds.length - 1,
          )}
          actionLabel={HELM_COPY.stopWaiting}
          onAction={() => saveFields({ waitsOnTaskIds: [] })}
        />
      );
    }
    return (
      <ConditionLine
        text={HELM_COPY.conditionWaitsOnWho}
        actionLabel={HELM_COPY.markAnswered}
        onAction={() => saveFields({ waitsOnWhoId: null })}
      />
    );
  };

  const getWaitsSummary = () =>
    waitedTasks.length === 0
      ? HELM_COPY.nothingValue
      : waitedTasks.length === 1
        ? waitedTasks[0].title
        : HELM_COPY.waitsOnTasks(waitedTasks.length);

  const canPlan =
    sources !== null &&
    doneAt === null &&
    !task.isUnreadable &&
    activity?.kind === 'active' &&
    plannedKey === null;
  const getFound = () => {
    if (!sources || shownView !== 'plan') return null;
    const { todayKey } = sources;
    const plannerTask = toPlannerTask(task);
    return (
      [todayKey, shiftDayKey(todayKey, 1)]
        .flatMap((dayKey) =>
          getOpenings(sources, dayKey, plannerTask, null, 1).map((opening) => ({
            dayKey,
            opening,
          })),
        )
        .at(0) ?? null
    );
  };
  const found = getFound();
  const place = (
    dayKey: string,
    opening: Opening | null,
    source: 'nomos' | 'person',
  ) => {
    run(
      addKeptSlot(uid, dayKey, {
        taskId: task.id,
        startAt: opening?.startAt ?? null,
        endAt: opening?.endAt ?? null,
        source,
      }),
    );
    setPlanMode('main');
    go('main');
  };

  const getPlanBody = () => {
    if (!sources) return null;
    const plannerTask = toPlannerTask(task);
    const { todayKey, timeZone: zone } = sources;
    const body = (mode: typeof planMode, headline: string | null) => (
      <PlacementBody
        mode={mode}
        sources={sources}
        task={plannerTask}
        slotId={null}
        currentStartAt={null}
        headline={headline}
        chip={
          mode === 'main'
            ? task.durationMinutes
              ? formatLength(task.durationMinutes)
              : HELM_COPY.planEstimate
            : null
        }
        assistantName={assistantName}
        onModeChange={setPlanMode}
        onBack={
          mode === 'main'
            ? null
            : () => setPlanMode(mode === 'days' ? 'times' : 'main')
        }
        onPlace={(dayKey, opening) => place(dayKey, opening, 'person')}
      />
    );
    if (!found) {
      return (
        <div className='space-y-3'>
          <BackLink onBack={() => go('main')} />
          <p className='text-[15px] text-pretty'>{HELM_COPY.planNoRoom}</p>
          <PlacementBody
            mode='days'
            sources={sources}
            task={plannerTask}
            slotId={null}
            currentStartAt={null}
            headline={null}
            chip={null}
            assistantName={assistantName}
            onModeChange={setPlanMode}
            onBack={null}
            onPlace={(dayKey, opening) => place(dayKey, opening, 'person')}
          />
        </div>
      );
    }
    const dayWord = formatDayWord(found.dayKey, todayKey);
    return (
      <div className='space-y-3'>
        {planMode === 'main' && <BackLink onBack={() => go('main')} />}
        {body(
          planMode,
          found.opening
            ? HELM_COPY.planFoundSlot(
                dayWord,
                formatSlotRange(
                  found.opening.startAt,
                  found.opening.endAt,
                  zone,
                ),
              )
            : HELM_COPY.planFoundNoTime(dayWord),
        )}
      </div>
    );
  };

  const getFooter = () => {
    if (shownView === 'plan') {
      return found ? (
        <PlacementFooter
          mode={planMode}
          leftAction={null}
          onModeChange={setPlanMode}
          onKeep={() => place(found.dayKey, found.opening, 'nomos')}
        />
      ) : null;
    }
    if (shownView !== 'main') return null;
    return (
      <>
        <div className={FOOT}>
          <ModalFooterActions
            leftActions={
              <DeleteIconButton
                label={HELM_COPY.deleteConfirm}
                onClick={() => void remove()}
              />
            }
            rightActions={
              plannedKey !== null && doneAt === null && sources ? (
                <p className='text-muted-foreground text-sm'>
                  {HELM_COPY.planPlannedOn(
                    formatDayWord(plannedKey, sources.todayKey),
                  )}
                </p>
              ) : canPlan ? (
                <Button
                  type='button'
                  variant='primary'
                  onClick={() => {
                    setPlanMode('main');
                    go('plan');
                  }}
                >
                  {HELM_COPY.planPlanIt}
                </Button>
              ) : null
            }
          />
        </div>
        <AskAboutThisControl placement='sheet' />
      </>
    );
  };

  const getBody = () => {
    if (shownView === 'plan') return getPlanBody();
    if (shownView === 'title') {
      return (
        <WordsEditor
          label={HELM_COPY.taskTitleLabel}
          initial={title}
          isRequired
          maxLength={TASK_TITLE_CAP}
          isOffline={isOffline}
          toValue={toTaskTitle}
          onSave={(value) => saveWords({ kind: 'title', title: value })}
          onSaved={(value) => {
            setHeldTitle({ taskId: task.id, from: task.title, text: value });
            go('main');
          }}
          onDirtyChange={setIsWordsDirty}
          onBack={() => go('main')}
        />
      );
    }
    if (shownView === 'notes') {
      return (
        <WordsEditor
          label={HELM_COPY.notesLabel}
          initial={notes ?? ''}
          isMultiline
          maxLength={NOTES_MAX_CHARS}
          isOffline={isOffline}
          toValue={(text) => text.trim()}
          onSave={(value) => saveWords({ kind: 'notes', notes: value || null })}
          onSaved={(value) => {
            setHeldNotes({
              taskId: task.id,
              from: task.notes,
              text: value || null,
            });
            go('main');
          }}
          onDirtyChange={setIsWordsDirty}
          onBack={() => go('main')}
        />
      );
    }
    if (stepId !== null && step) {
      return (
        <WordsEditor
          key={stepId}
          label={HELM_COPY.editStep}
          initial={step.text}
          isRequired
          maxLength={TASK_TITLE_CAP}
          isOffline={isOffline}
          toValue={toTaskTitle}
          onSave={(value) =>
            saveWords({ kind: 'editStep', stepId, text: value })
          }
          onSaved={() => go('steps')}
          onDirtyChange={setIsWordsDirty}
          onBack={() => go('steps')}
        />
      );
    }
    if (shownView === 'steps') {
      return (
        <TaskSteps
          editing={editing}
          onEdit={(id) => go(`step:${id}`)}
          onBack={() => go('main')}
        />
      );
    }
    if (shownView === 'waits') {
      return (
        <WaitsOnPicker
          candidates={candidates}
          selectedIds={task.waitsOnTaskIds}
          onDone={(ids) => {
            saveFields({ waitsOnTaskIds: ids });
            go('main');
          }}
          onBack={() => go('main')}
        />
      );
    }
    return (
      <div className='space-y-4'>
        {task.isUnreadable && (
          <p className='text-muted-foreground text-sm text-pretty'>
            {HELM_COPY.taskWordsUnreadable}
          </p>
        )}
        {doneAt !== null && (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <span className='min-w-0 flex-1 tabular-nums'>
              {getDoneLine(doneAt, nowMinute)}
            </span>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className={SMALL_ACTION}
              onClick={() => onUndoTick(task.id)}
            >
              {HELM_COPY.undo}
            </Button>
          </div>
        )}
        {getCondition()}
        <div className='space-y-2'>
          {!task.isUnreadable && (
            <SummaryRow
              label={HELM_COPY.taskTitleLabel}
              onClick={() => go('title')}
            >
              {title}
            </SummaryRow>
          )}
          <WhenRow editing={editing} now={nowMinute} />
          {linked.map((entry) => (
            <SummaryRow
              key={`${entry.kind}:${entry.id}`}
              label={getLinkedLabel(entry.kind)}
              onClick={() =>
                afterBackLayersClose(
                  () =>
                    void showView(
                      entry.kind === 'place' ? 'place' : 'who',
                      entry.id,
                    ),
                )
              }
            >
              {entry.name}
            </SummaryRow>
          ))}
          {taskProject && !taskProject.isUnreadable && (
            <SummaryRow
              label={HELM_COPY.taskProjectRow}
              onClick={() =>
                afterBackLayersClose(
                  () => void showView('project', taskProject.id),
                )
              }
            >
              {taskProject.emoji
                ? `${taskProject.emoji} ${taskProject.name}`
                : taskProject.name}
            </SummaryRow>
          )}
          {!task.isUnreadable && (
            <SummaryRow
              label={HELM_COPY.stepsLabel}
              onClick={() => go('steps')}
            >
              {steps.length === 0
                ? HELM_COPY.noneValue
                : HELM_COPY.stepsCount(
                    steps.filter((entry) => entry.doneAt !== null).length,
                    steps.length,
                  )}
            </SummaryRow>
          )}
        </div>
        <ShowMoreButton
          isOpen={isDetailsOpen}
          onClick={() => setDetailsFor(isDetailsOpen ? null : task.id)}
        >
          {isDetailsOpen ? HELM_COPY.fewerDetails : HELM_COPY.moreDetails}
        </ShowMoreButton>
        {isDetailsOpen && (
          <TaskDetails
            editing={editing}
            notes={notes}
            waitsOnSummary={getWaitsSummary()}
            onOpenNotes={() => go('notes')}
            onOpenWaits={() => go('waits')}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <PublishTaskScreen taskId={task.id} title={titleOf} screen={screen} />
      <DetailSheet
        isOpen
        onClose={requestClose}
        title={shownTitle}
        viewKey={shownView}
        actions={
          <TickButton
            isDone={doneAt !== null}
            label={
              doneAt !== null
                ? HELM_COPY.markNotDone(titleOf)
                : HELM_COPY.markDone(titleOf)
            }
            onClick={() =>
              doneAt !== null ? onUndoTick(task.id) : onTick(task)
            }
          />
        }
        footer={getFooter()}
      >
        <div key={task.id}>{getBody()}</div>
      </DetailSheet>
    </>
  );
}

export default TaskSheet;
