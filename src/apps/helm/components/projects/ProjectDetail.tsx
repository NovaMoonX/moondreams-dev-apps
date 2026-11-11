import { useMemo, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShort, formatDateShortUTC } from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import DoneTasksFold from '@apps/helm/components/projects/DoneTasksFold';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
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
import { selectProjectById } from '@apps/helm/store/selectors/projectSelectors';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { sortProjectTasks } from '@apps/helm/utils/projectTasks';

const { option } = DropdownMenuFactories;

type ProjectTab = 'tasks' | 'milestones' | 'people';

interface ProjectDetailProps {
  projectId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
  onOpenWho: (whoId: string) => void;
  onOpenRun: (runId: string) => void;
}

/** One project: what it is, what its tasks show, and tabs for its tasks and its people. A finished project reads only, with a way to reopen it. */
function ProjectDetail({
  projectId,
  backLabel,
  onBack,
  onHome,
  onOpenWho,
  onOpenRun,
}: ProjectDetailProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const now = useNow(60_000);
  const { isLoaded } = useAppSelector((state) => state.helm.projects);
  const project =
    useAppSelector(selectProjectById).get(projectId ?? '') ?? null;
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [tab, setTab] = useState<ProjectTab>('tasks');
  const [isAllTasks, setIsAllTasks] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
    const change = setProjectStatus(user.uid, project, next);
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

  const menu =
    project && !project.isUnreadable
      ? {
          items: [
            ...(isFinished
              ? [
                  option({
                    label: HELM_COPY.projectReopen,
                    value: 'reopen',
                  }),
                ]
              : [
                  option({
                    label: HELM_COPY.projectMenuEdit,
                    value: 'edit',
                  }),
                  option({
                    label: HELM_COPY.projectMenuFinish,
                    value: 'finish',
                  }),
                ]),
            option({ label: HELM_COPY.projectMenuDelete, value: 'delete' }),
          ],
          onItemSelect: (value: string) => {
            if (value === 'edit') setIsEditing(true);
            else if (value === 'finish') changeStatus('finished');
            else if (value === 'reopen') changeStatus('active');
            else if (value === 'delete') void remove();
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
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                {project.emoji && (
                  <span aria-hidden='true'>{project.emoji} </span>
                )}
                {project.name}
              </h1>
              {project.objective && (
                <p className='text-[15px] break-words'>{project.objective}</p>
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
            ) : (
              <EvidenceLine
                project={project}
                onFinish={() => changeStatus('finished')}
              />
            )}
            <RunsSection
              field='attachedTo.id'
              id={project.id}
              variant='thing'
              onOpen={onOpenRun}
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
      </main>
      {project && !project.isUnreadable && (
        <ProjectEditSheet
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          project={project}
        />
      )}
    </>
  );
}

export default ProjectDetail;
