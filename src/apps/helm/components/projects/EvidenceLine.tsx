import { Fragment } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { selectProjectEvidence } from '@apps/helm/engine/projectEvidence';
import { selectWhoById } from '@apps/helm/store/selectors/whoSelectors';
import type { OpenProject } from '@apps/helm/types';

interface EvidenceLineProps {
  project: OpenProject;
  /** Offered beside "Everything is done" on the project's own page. */
  onFinish?: () => void;
}

/** What the project's tasks show, in a muted line: only an overdue count is coloured, and there is never a percentage or a bar. */
function EvidenceLine({ project, onFinish }: EvidenceLineProps) {
  const now = useNow(60_000);
  const tasks = useAppSelector((state) => state.helm.projectTasks.items);
  const whoById = useAppSelector(selectWhoById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const evidence = selectProjectEvidence({
    project,
    tasks,
    whoNames: new Map(
      Object.keys(project.whoRoles).flatMap((id) => {
        const who = whoById.get(id);
        return who && !who.isUnreadable ? [[id, who.name] as const] : [];
      }),
    ),
    now,
    timeZone: profileZone ?? getDeviceTimeZone() ?? 'UTC',
  });

  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
      <p className='text-muted-foreground min-w-0 text-[13px] break-words'>
        {evidence.parts.map((part, index) => (
          <Fragment key={part.text}>
            {index > 0 ? ' · ' : ''}
            <span
              className={join(
                'whitespace-nowrap',
                part.tone === 'warning' && 'text-[var(--helm-overdue)]',
              )}
            >
              {part.text}
            </span>
          </Fragment>
        ))}
      </p>
      {evidence.canFinish && onFinish && (
        <Button type='button' size='sm' variant='secondary' onClick={onFinish}>
          {HELM_COPY.projectFinishButton}
        </Button>
      )}
    </div>
  );
}

export default EvidenceLine;
