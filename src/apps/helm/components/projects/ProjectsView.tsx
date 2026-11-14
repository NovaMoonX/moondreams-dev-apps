import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import EvidenceLine from '@apps/helm/components/projects/EvidenceLine';
import ProjectQuestionFlow from '@apps/helm/components/projects/ProjectQuestionFlow';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
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
}

interface ProjectRowProps {
  project: OpenProject;
  isFinished: boolean;
  onOpen: (projectId: string) => void;
}

function ProjectRow({ project, isFinished, onOpen }: ProjectRowProps) {
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
            {isFinished ? (
              <span className='text-muted-foreground text-[13px]'>
                {HELM_COPY.projectFinishedBar(
                  formatDateShort(project.finishedAt ?? project.createdAt),
                )}
              </span>
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

/** Projects: the ones going, each with what its tasks show, then the finished ones behind a thin row. */
function ProjectsView({ onBack, onHome, onOpenProject }: ProjectsViewProps) {
  const { isLoaded, isFailed } = useAppSelector((state) => state.helm.projects);
  const active = useAppSelector(selectActiveProjects);
  const finished = useAppSelector(selectFinishedProjects);
  const [isFinishedOpen, setIsFinishedOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useScreenContext('projects', null, [], {
    ask: HELM_COPY.askProjects,
    chip: HELM_COPY.chipProjects,
    back: HELM_COPY.backToProjects,
  });

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
            onClick={() => setIsStarting(true)}
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
        {isLoaded && active.length === 0 && finished.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.projectsEmpty}
          </p>
        )}
        {active.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {active.map((project) => (
              <li key={project.id}>
                <ProjectRow
                  project={project}
                  isFinished={false}
                  onOpen={onOpenProject}
                />
              </li>
            ))}
          </ul>
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
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {finished.map((project) => (
                  <li key={project.id}>
                    <ProjectRow
                      project={project}
                      isFinished
                      onOpen={onOpenProject}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <ProjectQuestionFlow
        isOpen={isStarting}
        onClose={() => setIsStarting(false)}
        onOpenProject={onOpenProject}
      />
    </>
  );
}

export default ProjectsView;
