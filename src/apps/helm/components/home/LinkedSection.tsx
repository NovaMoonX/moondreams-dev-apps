import { useMemo } from 'react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import GroupingSourceRow from '@apps/helm/components/home/GroupingSourceRow';
import { HELM_COPY } from '@apps/helm/constants';
import {
  selectGroupingsUnder,
  selectOpenGroupings,
} from '@apps/helm/store/selectors/groupingSelectors';

interface LinkedSectionProps {
  kind: 'project' | 'topic';
  parentId: string;
}

function LinkedSection({ kind, parentId }: LinkedSectionProps) {
  const groupings = useAppSelector(selectOpenGroupings);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const listedTaskKeys = useMemo(
    () =>
      new Set(
        [...openTasks, ...projectTasks]
          .filter((task) => task.projectId === parentId)
          .map((task) => `tasks/${task.id}`),
      ),
    [openTasks, projectTasks, parentId],
  );
  const rows = useMemo(
    () =>
      Array.from(
        new Map(
          selectGroupingsUnder(groupings, kind, parentId).flatMap((grouping) =>
            grouping.sources
              .filter(
                (source) =>
                  source.key !== `${kind}s/${parentId}` &&
                  !(kind === 'project' && listedTaskKeys.has(source.key)),
              )
              .map((source) => [
                source.key,
                { source, title: grouping.titles[source.key] },
              ]),
          ),
        ).values(),
      ),
    [groupings, kind, parentId, listedTaskKeys],
  );
  if (rows.length === 0) return null;

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.groupingLinkedHeading} />
      <ul className='space-y-3'>
        {rows.map((row) => (
          <GroupingSourceRow
            key={row.source.key}
            source={row.source}
            title={row.title}
          />
        ))}
      </ul>
    </section>
  );
}

export default LinkedSection;
