import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import MethodPicker from '@/components/MethodPicker';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
import GoalEvidenceLine from '@apps/helm/components/projects/GoalEvidenceLine';
import ImportanceDoor from '@apps/helm/components/importance/ImportanceDoor';
import GoalQuestionFlow from '@apps/helm/components/projects/GoalQuestionFlow';
import ProjectQuestionFlow from '@apps/helm/components/projects/ProjectQuestionFlow';
import { useImportanceToday } from '@apps/helm/hooks/useImportancePlace';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import AddRow from '@apps/helm/components/who/AddRow';
import { HELM_COPY } from '@apps/helm/constants';
import { selectImportanceOrder } from '@apps/helm/store/selectors/importanceSelectors';
import {
  selectActiveProjects,
  selectFinishedProjects,
} from '@apps/helm/store/selectors/projectSelectors';
import type { OpenProject } from '@apps/helm/types';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';

interface ProjectsViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenImportance: () => void;
}

type RowState = 'going' | 'finished' | 'aside';

interface ProjectRowProps {
  project: OpenProject;
  state: RowState;
  onOpen: (projectId: string) => void;
}

function ProjectRow({ project, state, onOpen }: ProjectRowProps) {
  return (
    <div className='flex items-center pr-4'>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto min-w-0 flex-1 items-center gap-3 rounded-none border-0 py-3 pl-4 text-left focus-visible:-outline-offset-2'
        onClick={() => onOpen(project.id)}
      >
        <span className='w-7 shrink-0 text-center text-2xl' aria-hidden='true'>
          {project.emoji ?? (project.kind === 'goal' ? '\u{1F331}' : '')}
        </span>
        <span className='min-w-0 flex-1'>
          <PrivateTitle
            kind='project'
            record={project}
            className='text-foreground text-[15px] leading-[21px]'
          >
            {project.name}
          </PrivateTitle>
          <span className='block'>
            {state === 'finished' ? (
              <span className='text-muted-foreground text-[13px]'>
                {HELM_COPY.projectFinishedBar(
                  formatDateShort(project.finishedAt ?? project.createdAt),
                )}
              </span>
            ) : state === 'aside' ? (
              <span className='text-muted-foreground text-[13px]'>
                {HELM_COPY.goalsSetAsideListLine(
                  formatDateShort(project.pausedAt ?? project.createdAt),
                )}
              </span>
            ) : project.kind === 'goal' ? (
              <GoalEvidenceLine projectId={project.id} />
            ) : (
              <EvidenceLine project={project} />
            )}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </div>
  );
}

const KIND_METHODS = (pick: (kind: 'project' | 'goal') => void) => [
  {
    id: 'project',
    emoji: '\u{1F4CC}',
    title: HELM_COPY.projectKindProject,
    description: HELM_COPY.projectKindProjectHint,
    onPick: () => pick('project'),
  },
  {
    id: 'goal',
    emoji: '\u{1F331}',
    title: HELM_COPY.projectKindGoal,
    description: HELM_COPY.projectKindGoalHint,
    onPick: () => pick('goal'),
  },
];

interface RowListProps {
  projects: OpenProject[];
  state: RowState;
  onOpen: (projectId: string) => void;
  /** The list's last row, where a list keeps its add. */
  footer?: ReactNode;
}

function RowList({ projects, state, onOpen, footer }: RowListProps) {
  return (
    <ul className='helm-card divide-border divide-y overflow-hidden'>
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectRow project={project} state={state} onOpen={onOpen} />
        </li>
      ))}
      {footer && <li>{footer}</li>}
    </ul>
  );
}

/** Projects and goals: the ones going, goals first under their own divider once there is one, each with what it shows; set-aside and finished ones behind thin rows. */
function ProjectsView({
  onBack,
  onHome,
  onOpenProject,
  onOpenImportance,
}: ProjectsViewProps) {
  const { isLoaded, isFailed } = useAppSelector((state) => state.helm.projects);
  const items = useAppSelector((state) => state.helm.projects.items);
  const active = useAppSelector(selectActiveProjects);
  const finished = useAppSelector(selectFinishedProjects);
  const [isFinishedOpen, setIsFinishedOpen] = useState(false);
  const [isAsideOpen, setIsAsideOpen] = useState(false);
  const [starting, setStarting] = useState<'kind' | 'project' | 'goal' | null>(
    null,
  );

  const today = useImportanceToday();
  const order = useAppSelector((state) => selectImportanceOrder(state, today));
  const byOrder = (list: OpenProject[]) => {
    const canWaitAt = order.rows.findIndex((row) => row.group === 'canWait');
    const rankOf = (id: string) => {
      const at = order.rows.findIndex((row) => row.id === id);
      if (at >= 0) return at;
      return canWaitAt >= 0 ? canWaitAt - 0.5 : order.rows.length;
    };
    return [...list].sort((left, right) => rankOf(left.id) - rankOf(right.id));
  };
  const goals = byOrder(active.filter((project) => project.kind === 'goal'));
  const projects = byOrder(active.filter((project) => project.kind !== 'goal'));
  const aside = useMemo(
    () =>
      items
        .filter(
          (project) =>
            !project.isUnreadable &&
            project.kind === 'goal' &&
            project.status === 'paused',
        )
        .sort((left, right) => (right.pausedAt ?? 0) - (left.pausedAt ?? 0)),
    [items],
  );
  const hasAnyGoal =
    goals.length > 0 ||
    aside.length > 0 ||
    finished.some((project) => project.kind === 'goal');

  useScreenContext('projects', null, [], {
    ask: hasAnyGoal ? HELM_COPY.goalsAskProjects : HELM_COPY.askProjects,
    chip: HELM_COPY.chipProjects,
    back: HELM_COPY.backToProjects,
  });

  const newProjectRow = (
    <AddRow
      label={HELM_COPY.projectsNew}
      onClick={() => setStarting(hasAnyGoal ? 'project' : 'kind')}
      isInList
    />
  );

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.projectsTitle}
        </h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.projectsFailed}
          </p>
        )}
        <ImportanceDoor onOpen={onOpenImportance} />
        {isLoaded &&
          active.length === 0 &&
          finished.length === 0 &&
          aside.length === 0 && (
            <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
              {HELM_COPY.projectsEmpty}
            </p>
          )}
        {hasAnyGoal && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.goalsTitle} />
            <RowList
              projects={goals}
              state='going'
              onOpen={onOpenProject}
              footer={
                <AddRow
                  label={HELM_COPY.goalsNew}
                  onClick={() => setStarting('goal')}
                  isInList
                />
              }
            />
          </section>
        )}
        {hasAnyGoal && <SectionDivider label={HELM_COPY.projectsTitle} />}
        <RowList
          projects={projects}
          state='going'
          onOpen={onOpenProject}
          footer={newProjectRow}
        />
        {aside.length > 0 && (
          <section className='space-y-3'>
            <ShowMoreButton
              isOpen={isAsideOpen}
              onClick={() => setIsAsideOpen((isOpen) => !isOpen)}
            >
              {isAsideOpen
                ? HELM_COPY.goalsSetAsideHide
                : HELM_COPY.goalsSetAsideRow(aside.length)}
            </ShowMoreButton>
            {isAsideOpen && (
              <RowList projects={aside} state='aside' onOpen={onOpenProject} />
            )}
          </section>
        )}
        {finished.length > 0 && (
          <section className='space-y-3'>
            <ShowMoreButton
              isOpen={isFinishedOpen}
              onClick={() => setIsFinishedOpen((isOpen) => !isOpen)}
            >
              {isFinishedOpen
                ? HELM_COPY.projectsFinishedHide
                : HELM_COPY.projectsFinishedRow(finished.length)}
            </ShowMoreButton>
            {isFinishedOpen && (
              <RowList
                projects={finished}
                state='finished'
                onOpen={onOpenProject}
              />
            )}
          </section>
        )}
      </main>
      <FormSheet
        isOpen={starting === 'kind'}
        onClose={() => setStarting(null)}
        title={HELM_COPY.projectKindTitle}
      >
        <MethodPicker methods={KIND_METHODS(setStarting)} />
      </FormSheet>
      <ProjectQuestionFlow
        isOpen={starting === 'project'}
        onClose={() => setStarting(null)}
        onOpenProject={onOpenProject}
      />
      <GoalQuestionFlow
        isOpen={starting === 'goal'}
        onClose={() => setStarting(null)}
        onOpenProject={onOpenProject}
      />
    </>
  );
}

export default ProjectsView;
