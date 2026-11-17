import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { markGroupingTold } from '@apps/helm/store/actions/groupingActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenGrouping } from '@apps/helm/types';

interface GroupingFiledLineProps {
  grouping: OpenGrouping;
}

/** The quiet "Linked 2 things to Moving. · Undo" line, marked told once it is on screen. */
function GroupingFiledLine({ grouping }: GroupingFiledLineProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const marked = useRef<string | null>(null);
  const name = useAppSelector((state) =>
    grouping.parentKind === 'project'
      ? state.helm.projects.items.find((one) => one.id === grouping.parentId)
          ?.name
      : state.helm.topics.items.find((one) => one.id === grouping.parentId)
          ?.name,
  );

  useEffect(() => {
    if (!user || grouping.toldAt !== null || marked.current === grouping.id)
      return;
    marked.current = grouping.id;
    markGroupingTold(user.uid, grouping.id).catch((error: unknown) =>
      console.error('Helm grouping was not marked told', error),
    );
  }, [user, grouping.id, grouping.toldAt]);

  if (!name || grouping.executionId === null) return null;
  const { executionId } = grouping;

  const undo = () => {
    if (!user) return;
    takeBack(user.uid, executionId)
      .then((result) => {
        if (result.kind !== 'done') throw new Error('Not taken back');
      })
      .catch((error: unknown) => {
        console.error('Helm grouping was not taken back', error);
        addToast({ title: HELM_COPY.groupingFiledUndoFailed, type: 'error' });
      });
  };

  return (
    <p className='text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 text-[15px]'>
      <span className='min-w-0 break-words'>
        {HELM_COPY.groupingLinkedLine(
          grouping.linkedKeys.length || grouping.sourceKeys.length,
          name,
        )}
      </span>
      <span aria-hidden='true'>·</span>
      <Button type='button' variant='tertiary' size='sm' onClick={undo}>
        {HELM_COPY.undo}
      </Button>
    </p>
  );
}

export default GroupingFiledLine;
