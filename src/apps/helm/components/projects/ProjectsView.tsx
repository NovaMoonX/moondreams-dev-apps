import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import MethodPicker from '@/components/MethodPicker';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
import GoalQuestionFlow from '@apps/helm/components/projects/GoalQuestionFlow';
import ProjectQuestionFlow from '@apps/helm/components/projects/ProjectQuestionFlow';
import { useGoalEvidence } from '@apps/helm/hooks/useGoalEvidence';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import AddRow from '@apps/helm/components/who/AddRow';
import { HELM_COPY } from '@apps/helm/constants';
import {
  selectActiveProjects,
  selectFinishedProjects,
} from '@apps/helm/store/selectors/projectSelectors';
import { selectGoalHabits } from '@apps/helm/store/selectors/habitSelectors';
import type { OpenProject } from '@apps/helm/types';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';

interface ProjectsViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenProject: (projectId: string) => void;
}

type RowState = 'going' | 'finished' | 'aside';

interface ProjectRowProps {
  project: OpenProject;
  state: RowState;
  onOpen: (projectId: string) => void;
}

function GoalEvidenceLine({ projectId }: { projectId: string }) {
  const evidence = useGoalEvidence(projectId);
  const hasHabits = useAppSelector(
    (state) => selectGoalHabits(state, projectId).length > 0,
  );
  if (evidence) {
    return (
      <span className='text-muted-foreground line-clamp-2 text-[13px] leading-[18px]'>
        {evidence}
      </span>
    );
  }
  return hasHabits ? <span className='block min-h-[18px]' /> : null;
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
          {project.emoji ?? ''}
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
                {HELM_COPY.goalsSetAsideLine(
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
function ProjectsView({ onBack, onHome, onOpenProject }: ProjectsViewProps) {
  const { isLoaded, isFailed } = useAppSelector((state) => state.helm.projects);
  const items = useAppSelector((state) => state.helm.projects.items);
  const active = useAppSelector(selectActiveProjects);
  const finished = useAppSelector(selectFinishedProjects);
  const [isFinishedOpen, setIsFinishedOpen] = useState(false);
  const [isAsideOpen, setIsAsideOpen] = useState(false);
  const [starting, setStarting] = useState<'kind' | 'project' | 'goal' | null>(
    null,
  );

  const goals = active.filter((project) => project.kind === 'goal');
  const projects = active.filter((project) => project.kind !== 'goal');
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

  const startProject = () => setStarting(hasAnyGoal ? 'project' : 'kind');

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <div className='flex items-center justify-between gap-3'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.projectsTitle}
          </h1>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
            onClick={startProject}
          >
            <Plus className='size-4' aria-hidden='true' />
            {HELM_COPY.projectsNew}
          </Button>
        </div>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.projectsFailed}
          </p>
        )}
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
        {hasAnyGoal && projects.length > 0 && (
          <SectionDivider label={HELM_COPY.projectsTitle} />
        )}
        {projects.length > 0 && (
          <RowList projects={projects} state='going' onOpen={onOpenProject} />
        )}
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
