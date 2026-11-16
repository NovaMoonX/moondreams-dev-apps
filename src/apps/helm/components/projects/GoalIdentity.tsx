import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateShort } from '@/utils/formatUtils';
import { readWhySource } from '@apps/helm/components/projects/goalWhyView';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import { useGoalEvidence } from '@apps/helm/hooks/useGoalEvidence';
import type { OpenProject } from '@apps/helm/types';
import { readShownWhy } from '@apps/helm/utils/goalWhy';

interface GoalIdentityProps {
  project: OpenProject;
  onOpenWhy: () => void;
  onAddWhy: () => void;
}

/** A goal's identity: its emoji and name, the why in quotes with where it came from, and the evidence line. */
function GoalIdentity({ project, onOpenWhy, onAddWhy }: GoalIdentityProps) {
  const evidence = useGoalEvidence(project.id);
  const shown = readShownWhy(project.why);

  return (
    <div className='space-y-2'>
      <div className='flex items-start gap-3'>
        {project.emoji && (
          <span
            className='bg-secondary grid size-10 shrink-0 place-items-center rounded-full text-xl'
            aria-hidden='true'
          >
            {project.emoji}
          </span>
        )}
        <h1 className='helm-serif min-w-0 text-[28px] leading-[34px] break-words'>
          {project.name}
        </h1>
      </div>
      {project.why && shown ? (
        <Button
          type='button'
          variant='tertiary'
          className='h-auto w-full items-start justify-start !px-0 py-1 text-left'
          onClick={onOpenWhy}
        >
          <span className='min-w-0 flex-1'>
            <span className='text-foreground line-clamp-2 text-[15px] break-words'>
              {`“${shown.text}”`}
            </span>
            <span className='text-muted-foreground mt-1 flex items-center gap-2 text-[13px]'>
              <SourceRing isConfirmed label={HELM_COPY.goalWhyRingLabel} />
              {readWhySource(project.why, shown.isTidied)}
            </span>
          </span>
        </Button>
      ) : (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='-ml-3'
          onClick={onAddWhy}
        >
          {HELM_COPY.goalWhyAdd}
        </Button>
      )}
      <p className='text-muted-foreground text-[13px]'>
        {HELM_COPY.goalKindLine(formatDateShort(project.createdAt))}
      </p>
      {evidence && (
        <p className='text-muted-foreground text-[13px] break-words'>
          {evidence}
        </p>
      )}
    </div>
  );
}

export default GoalIdentity;
