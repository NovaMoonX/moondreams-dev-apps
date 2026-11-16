import { useMemo, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { selectSubjectGuardrail } from '@apps/helm/store/selectors/patternSelectors';
import { formatDateShort, formatDateShortUTC } from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import DoneTasksFold from '@apps/helm/components/projects/DoneTasksFold';
import GuardrailLine from '@apps/helm/components/noticed/GuardrailLine';
import ImportancePlaceRow from '@apps/helm/components/importance/ImportancePlaceRow';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
import GoalHabits from '@apps/helm/components/projects/GoalHabits';
import GoalHabitsChoiceSheet from '@apps/helm/components/projects/GoalHabitsChoiceSheet';
import GoalIdentity from '@apps/helm/components/projects/GoalIdentity';
import { readTidyOffer } from '@apps/helm/components/projects/goalWhyView';
import WhySheet from '@apps/helm/components/projects/WhySheet';
import MilestonesTab from '@apps/helm/components/projects/MilestonesTab';
import ProjectEditSheet from '@apps/helm/components/projects/ProjectEditSheet';
import ProjectPeople from '@apps/helm/components/projects/ProjectPeople';
import { RunsSection } from '@apps/helm/components/procedures/RunRows';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import { DAY_MS, HELM_COPY, PROJECT_TASKS_SHOWN } from '@apps/helm/constants';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  deleteProject,
  countProjectTasks,
  ProjectDeletePartialError,
  setProjectStatus,
} from '@apps/helm/store/actions/projectActions';
import {
  deleteGoal,
  pickGoalBackUp,
  setGoalAside,
  setGoalStatus,
  turnIntoProject,
} from '@apps/helm/store/actions/goalActions';
import { KeepPrivateError } from '@apps/helm/store/actions/privacyActions';
import { selectProjectById } from '@apps/helm/store/selectors/projectSelectors';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { sortProjectTasks } from '@apps/helm/utils/projectTasks';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';

const { option, separator } = DropdownMenuFactories;

type ProjectTab = 'tasks' | 'milestones' | 'people';

interface ProjectDetailProps {
  projectId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
  onOpenWho: (whoId: string) => void;
  onOpenRun: (runId: string) => void;
  onOpenHabit: (habitId: string) => void;
  onOpenImportance: (focusId: string) => void;
}

/** One project: what it is, what its tasks show, and tabs for its tasks and its people. A finished project reads only, with a way to reopen it. */
function ProjectDetail({
  projectId,
  backLabel,
  onBack,
  onHome,
  onOpenWho,
  onOpenRun,
  onOpenHabit,
  onOpenImportance,
}: ProjectDetailProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const now = useNow(60_000);
  const { isLoaded } = useAppSelector((state) => state.helm.projects);
  const project =
    useAppSelector(selectProjectById).get(projectId ?? '') ?? null;
  const guardrail = useAppSelector((state) =>
    selectSubjectGuardrail(state, projectId ?? ''),
  );
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [tab, setTab] = useState<ProjectTab>('tasks');
  const [isAllTasks, setIsAllTasks] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isWhyFirst, setIsWhyFirst] = useState(false);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [habitsAsk, setHabitsAsk] = useState<'delete' | 'toProject' | null>(
    null,
  );
  const [isGoalBusy, setIsGoalBusy] = useState(false);
  const habits = useAppSelector((state) => state.helm.habits.items);

  const openTasks = useMemo(
    () =>
      sortProjectTasks(
        projectTasks.filter(
          (task) => task.projectId === projectId && task.status === 'open',
        ),
        timeZone,
        Math.floor(now / 60_000) * 60_000,
      ),
    [projectTasks, projectId, timeZone, now],
  );
  const doneTasks = useMemo(
    () =>
      projectTasks
        .filter(
          (task) =>
            task.projectId === projectId &&
            task.status === 'done' &&
            task.clearedAt === null,
        )
        .sort(
          (left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0),
        ),
    [projectTasks, projectId],
  );
  const shownTasks = isAllTasks
    ? openTasks
    : openTasks.slice(0, PROJECT_TASKS_SHOWN);
  const isFinished = project?.status === 'finished';
  const isGoal = project?.kind === 'goal';
  const isAside = project?.status === 'paused';
  const tidyOffer = readTidyOffer(project?.why ?? null);
  const goalHabitNames = habits
    .filter(
      (habit) =>
        !habit.isUnreadable &&
        habit.projectId === projectId &&
        habit.status !== 'ended',
    )
    .map((habit) => habit.name);
  const name = project && !project.isUnreadable ? project.name : '';

  useScreenContext(
    'project',
    null,
    openTasks.map((task) => ({ collection: 'tasks' as const, id: task.id })),
    {
      ask: name ? HELM_COPY.askProject(name) : HELM_COPY.projectsTitle,
      chip: HELM_COPY.chipAbout(name || HELM_COPY.projectsTitle),
      back: name ? HELM_COPY.backToProject(name) : HELM_COPY.backToProjects,
    },
  );

  const reportFailure = (error: unknown) => {
    console.error('Helm project was not changed', error);
    addToast({ title: HELM_COPY.editFailed, type: 'error' });
  };

  const changeStatus = (next: 'active' | 'finished') => {
    if (!user || !project) return;
    const change = isGoal
      ? setGoalStatus(user.uid, project, next)
      : setProjectStatus(user.uid, project, next);
    change.written.catch(reportFailure);
    addToast({
      title:
        next === 'finished'
          ? HELM_COPY.projectFinishedToast(project.name, openTasks.length)
          : HELM_COPY.projectReopenedToast(project.name),
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void change.undo().catch((error: unknown) => {
            console.error('Helm project was not put back', error);
            addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
          }),
      },
    });
  };

  const reportGoalFailure = (error: unknown) => {
    console.error('Helm goal was not changed', error);
    addToast({ title: HELM_COPY.goalActionFailed, type: 'error' });
  };

  const setAside = (isAsideNext: boolean) => {
    if (!user || !project) return;
    const change = isAsideNext
      ? setGoalAside(user.uid, project.id)
      : pickGoalBackUp(user.uid, project.id);
    change.written.catch(reportGoalFailure);
    addToast({
      title: isAsideNext
        ? HELM_COPY.goalAsideToast(project.name)
        : HELM_COPY.goalBackUpToast(project.name),
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () => void change.undo().catch(reportGoalFailure),
      },
    });
  };

  const runGoalChange = async (
    kind: 'delete' | 'toProject',
    habitsChoice: 'keep' | 'delete',
  ) => {
    if (!user || !project || isGoalBusy) return;
    setIsGoalBusy(true);
    try {
      if (kind === 'delete') {
        const made = await deleteGoal(user.uid, project.id, habitsChoice);
        made.written.catch(reportGoalFailure);
        onBack();
        addToast({
          title:
            habitsChoice === 'keep' && goalHabitNames.length > 0
              ? HELM_COPY.goalHabitsKeptToast(
                  goalHabitNames.length,
                  goalHabitNames[0],
                )
              : HELM_COPY.goalDeletedToast(project.name),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void made.restore().then(
                (outcome) =>
                  addToast({
                    title:
                      outcome === 'exists'
                        ? HELM_COPY.restoreExists
                        : HELM_COPY.projectDeletedBack(project.name),
                    type: 'info',
                  }),
                (error: unknown) => {
                  console.error('Helm deleted goal was not restored', error);
                  addToast({
                    title: HELM_COPY.projectUndoFailed,
                    type: 'error',
                  });
                },
              ),
          },
        });
      } else {
        const made = await turnIntoProject(user.uid, project.id, habitsChoice);
        made.written.catch(reportGoalFailure);
        addToast({
          title: HELM_COPY.goalToProjectToast(project.name),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void made.undo().catch((error: unknown) => {
                console.error('Helm goal was not put back', error);
                addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
              }),
          },
        });
      }
      setHabitsAsk(null);
    } catch (error) {
      if (error instanceof KeepPrivateError) {
        console.error('Helm goal was not changed', error);
        addToast({ title: HELM_COPY.privateNeedsConnection, type: 'error' });
      } else reportGoalFailure(error);
    }
    setIsGoalBusy(false);
  };

  const askGoalChange = async (kind: 'delete' | 'toProject') => {
    if (!project) return;
    if (goalHabitNames.length > 0) {
      setHabitsAsk(kind);
      return;
    }
    const isConfirmed = await confirm({
      title:
        kind === 'delete'
          ? HELM_COPY.goalMenuDelete
          : HELM_COPY.goalMenuToProject,
      message:
        kind === 'delete'
          ? HELM_COPY.goalDeleteConfirm(project.name)
          : HELM_COPY.goalToProjectConfirm(project.name),
      confirmText:
        kind === 'delete'
          ? HELM_COPY.goalDeleteAction
          : HELM_COPY.goalToProjectAction,
      destructive: kind === 'delete',
    });
    if (isConfirmed) await runGoalChange(kind, 'keep');
  };

  const remove = async () => {
    if (!user || !project) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.projectDeleteNeedsConnection, type: 'info' });
      return;
    }
    const counts = await countProjectTasks(user.uid, project.id).catch(
      (error: unknown) => {
        console.error('Helm project tasks were not counted', error);
        return null;
      },
    );
    if (counts === null) {
      addToast({ title: HELM_COPY.projectDeleteFailed, type: 'error' });
      return;
    }
    const isConfirmed = await confirm({
      title: HELM_COPY.projectMenuDelete,
      message: HELM_COPY.projectDeleteConfirm(
        project.name,
        counts.total,
        counts.done,
      ),
      confirmText: HELM_COPY.projectDeleteAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { restore } = await deleteProject(user.uid, project.id);
      onBack();
      addToast({
        title: HELM_COPY.projectDeletedToast(project.name),
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
                      : HELM_COPY.projectDeletedBack(project.name),
                  type: 'info',
                }),
              (error: unknown) => {
                console.error('Helm deleted project was not restored', error);
                addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm project was not deleted', error);
      addToast({
        title:
          error instanceof ProjectDeletePartialError
            ? HELM_COPY.projectDeletePartial(project.name)
            : HELM_COPY.projectDeleteFailed,
        type: 'error',
      });
    }
  };

  const openEdit = (isFirst: boolean) => {
    setIsWhyFirst(isFirst);
    setIsEditing(true);
  };

  const projectItems = [
    ...(isFinished
      ? [option({ label: HELM_COPY.projectReopen, value: 'reopen' })]
      : [
          option({ label: HELM_COPY.projectMenuEdit, value: 'edit' }),
          option({ label: HELM_COPY.projectMenuFinish, value: 'finish' }),
        ]),
    option({ label: HELM_COPY.projectMenuDelete, value: 'delete' }),
  ];
  const goalItems = [
    ...(isFinished
      ? [option({ label: HELM_COPY.goalMenuReopen, value: 'reopen' })]
      : [
          option({ label: HELM_COPY.goalMenuEdit, value: 'edit' }),
          option({
            label: isAside ? HELM_COPY.goalMenuBackUp : HELM_COPY.goalMenuAside,
            value: isAside ? 'backUp' : 'aside',
          }),
          option({ label: HELM_COPY.goalMenuFinish, value: 'finish' }),
        ]),
    option({ label: HELM_COPY.goalMenuToProject, value: 'toProject' }),
    separator(),
    option({ label: HELM_COPY.goalMenuDelete, value: 'deleteGoal' }),
  ];
  const menu =
    project && !project.isUnreadable
      ? {
          items: isGoal ? goalItems : projectItems,
          onItemSelect: (value: string) => {
            if (value === 'edit') openEdit(false);
            else if (value === 'finish') changeStatus('finished');
            else if (value === 'reopen') changeStatus('active');
            else if (value === 'delete') void remove();
            else if (value === 'aside') setAside(true);
            else if (value === 'backUp') setAside(false);
            else if (value === 'toProject') void askGoalChange('toProject');
            else if (value === 'deleteGoal') void askGoalChange('delete');
          },
        }
      : undefined;

  const daysAway =
    project?.targetDate == null
      ? null
      : Math.round(
          (project.targetDate -
            getDueDay({ kind: 'moment', at: now }, timeZone)) /
            DAY_MS,
        );

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={onBack}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !project && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.projectGone}
          </p>
        )}
        {project?.isUnreadable && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.projectUnreadable}
          </p>
        )}
        {project && !project.isUnreadable && (
          <>
            <div className='space-y-1'>
              {isGoal ? (
                <GoalIdentity
                  project={project}
                  onOpenWhy={() => setIsWhyOpen(true)}
                  onAddWhy={() => openEdit(true)}
                />
              ) : (
                <>
                  <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                    {project.emoji && (
                      <span aria-hidden='true'>{project.emoji} </span>
                    )}
                    {project.name}
                  </h1>
                  {project.objective && (
                    <p className='text-[15px] break-words'>
                      {project.objective}
                    </p>
                  )}
                </>
              )}
              {project.targetDate !== null && daysAway !== null && (
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.projectTargetLine(
                    formatDateShortUTC(project.targetDate),
                    daysAway,
                    isFinished,
                  )}
                </p>
              )}
            </div>
            {isGoal && !isFinished && tidyOffer && (
              <Button
                type='button'
                variant='tertiary'
                className='helm-card text-muted-foreground flex h-auto min-h-12 w-full min-w-0 items-center justify-between gap-2 px-4 py-3 text-left text-[15px] font-normal'
                onClick={() => setIsWhyOpen(true)}
              >
                <span className='min-w-0 flex-1 break-words'>
                  {HELM_COPY.goalsTidyRow}
                </span>
                <ChevronRight className='size-4 shrink-0' aria-hidden='true' />
              </Button>
            )}
            {isFinished ? (
              <div className='border-border bg-muted/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-2'>
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.projectFinishedBar(
                    formatDateShort(project.finishedAt ?? project.createdAt),
                  )}
                </p>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => changeStatus('active')}
                >
                  {HELM_COPY.projectReopen}
                </Button>
              </div>
            ) : isAside ? (
              <div className='border-border bg-muted/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-2'>
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.goalsSetAsideLine(
                    formatDateShort(project.pausedAt ?? project.createdAt),
                  )}
                </p>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => void setAside(false)}
                >
                  {HELM_COPY.goalPickBackUp}
                </Button>
              </div>
            ) : (
              !isGoal && (
                <EvidenceLine
                  project={project}
                  onFinish={() => changeStatus('finished')}
                />
              )
            )}
            {guardrail && <GuardrailLine pattern={guardrail} />}
            <ImportancePlaceRow
              id={project.id}
              variant='quiet'
              onOpen={onOpenImportance}
            />
            <RunsSection
              field='attachedTo.id'
              id={project.id}
              variant='thing'
              onOpen={onOpenRun}
              start={
                isGoal
                  ? undefined
                  : {
                      attachment: { kind: 'project', id: project.id },
                      label: project.name,
                      dueOn: null,
                      alsoIds: [],
                    }
              }
            />
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as ProjectTab)}
              variant='pills'
              aria-label={HELM_COPY.projectTabsLabel}
            >
              <TabsList>
                <TabsTrigger value='tasks'>
                  {HELM_COPY.projectTabTasks}
                </TabsTrigger>
                <TabsTrigger value='milestones'>
                  {HELM_COPY.projectTabMilestones}
                </TabsTrigger>
                <TabsTrigger value='people'>
                  {HELM_COPY.projectTabPeople}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === 'tasks' ? (
              <section className='space-y-3'>
                {isGoal && (
                  <>
                    <GoalHabits
                      projectId={project.id}
                      onOpenHabit={onOpenHabit}
                    />
                    <SectionDivider label={HELM_COPY.goalTasksHeading} />
                  </>
                )}
                <LinkedTasks
                  tasks={shownTasks}
                  emptyLine={HELM_COPY.projectTasksEmpty(
                    project.name,
                    doneTasks.length,
                  )}
                  view='project'
                  ownerId={project.id}
                />
                {openTasks.length > PROJECT_TASKS_SHOWN && (
                  <ShowMoreButton
                    isOpen={isAllTasks}
                    onClick={() => setIsAllTasks((isOpen) => !isOpen)}
                  >
                    {isAllTasks
                      ? HELM_COPY.projectTasksShowFewer
                      : HELM_COPY.projectTasksShowAll(openTasks.length)}
                  </ShowMoreButton>
                )}
                <DoneTasksFold projectId={project.id} tasks={doneTasks} />
              </section>
            ) : tab === 'milestones' ? (
              <MilestonesTab project={project} isReadOnly={isFinished} />
            ) : (
              <ProjectPeople
                project={project}
                isReadOnly={isFinished}
                onOpenWho={onOpenWho}
              />
            )}
          </>
        )}
        {project && !project.isUnreadable && (
          <PrivateRow kind='project' record={project} title={project.name} />
        )}
      </main>
      {project && !project.isUnreadable && (
        <ProjectEditSheet
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          project={project}
          isWhyFirst={isWhyFirst}
        />
      )}
      {project && !project.isUnreadable && isGoal && (
        <>
          <WhySheet
            isOpen={isWhyOpen}
            onClose={() => setIsWhyOpen(false)}
            project={project}
            onChange={() => {
              setIsWhyOpen(false);
              openEdit(true);
            }}
          />
          <GoalHabitsChoiceSheet
            isOpen={habitsAsk !== null}
            onClose={() => setHabitsAsk(null)}
            title={
              habitsAsk === 'toProject'
                ? HELM_COPY.goalMenuToProject
                : HELM_COPY.goalMenuDelete
            }
            message={
              habitsAsk === 'toProject'
                ? HELM_COPY.goalToProjectConfirm(project.name)
                : HELM_COPY.goalDeleteConfirm(project.name)
            }
            habitNames={goalHabitNames}
            confirmText={
              habitsAsk === 'toProject'
                ? HELM_COPY.goalToProjectAction
                : HELM_COPY.goalDeleteAction
            }
            isDestructive={habitsAsk !== 'toProject'}
            isBusy={isGoalBusy}
            onConfirm={(choice) =>
              habitsAsk && void runGoalChange(habitsAsk, choice)
            }
          />
        </>
      )}
    </>
  );
}

export default ProjectDetail;
