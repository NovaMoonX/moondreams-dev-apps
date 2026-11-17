import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import GroupingSourceRow from '@apps/helm/components/home/GroupingSourceRow';
import GroupingSourcesSheet from '@apps/helm/components/home/GroupingSourcesSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  groupThem,
  markNotRelated,
  notNowGrouping,
} from '@apps/helm/store/actions/groupingActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenGrouping } from '@apps/helm/types';

const SHOWN_SOURCES = 4;

interface GroupingCardProps {
  grouping: OpenGrouping;
}

/** Things that look like one thing, in the offer card's dashed look: Group them is the one button, and the two ways of saying no sit apart below a hairline, at opposite ends, so a quick tap on one never lands on the other. */
function GroupingCard({ grouping }: GroupingCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isListOpen, setIsListOpen] = useState(false);
  const isBusy = useRef(false);
  const parentName = useAppSelector((state) =>
    grouping.parentKind === 'project'
      ? state.helm.projects.items.find((one) => one.id === grouping.parentId)
          ?.name
      : state.helm.topics.items.find((one) => one.id === grouping.parentId)
          ?.name,
  );
  const name = parentName || grouping.proposedTitle?.trim() || '';
  const shown = grouping.sources.slice(0, SHOWN_SOURCES);
  const hidden = grouping.sources.length - shown.length;

  const fail = (error: unknown) => {
    console.error('Helm grouping was not saved', error);
    addToast({ title: HELM_COPY.groupingActionFailed, type: 'error' });
  };
  const withUndo = (title: string, undo: () => Promise<unknown>) =>
    addToast({
      title,
      type: 'info',
      action: {
        label: HELM_COPY.undo,
        onClick: () => void undo().catch(fail),
      },
    });

  const group = async () => {
    if (!user || isBusy.current) return;
    isBusy.current = true;
    try {
      const result = await groupThem(user.uid, grouping);
      if (result.kind === 'failed') return fail(new Error('Nothing to name'));
      result.written.catch(fail);
      withUndo(
        HELM_COPY.groupingGroupedToast(result.count, result.name),
        async () => {
          const undone = await takeBack(user.uid, result.executionId);
          if (undone.kind !== 'done') throw new Error('Not taken back');
        },
      );
    } catch (error) {
      fail(error);
    } finally {
      isBusy.current = false;
    }
  };

  const notRelated = () => {
    if (!user) return;
    const result = markNotRelated(user.uid, grouping);
    result.written.catch(fail);
    withUndo(HELM_COPY.groupingNotRelatedToast, result.undo);
  };

  const notNow = () => {
    if (!user) return;
    const result = notNowGrouping(user.uid, grouping);
    result.written.catch(fail);
    withUndo(HELM_COPY.groupingNotNowToast(result.weeks), result.undo);
  };

  return (
    <section className='helm-card border-primary/40! w-full space-y-3 border-dashed! p-4'>
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty break-words'>
        {name ? HELM_COPY.groupingTitle(name) : HELM_COPY.groupingTitleUnnamed}
      </p>
      <ul className='space-y-3'>
        {shown.map((source) => (
          <GroupingSourceRow
            key={source.key}
            source={source}
            title={grouping.titles[source.key]}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => setIsListOpen(true)}
        >
          {HELM_COPY.groupingMore(hidden)}
        </Button>
      )}
      <Button type='button' className='w-full' onClick={() => void group()}>
        {HELM_COPY.groupingGroup}
      </Button>
      <div className='border-border flex items-center justify-between border-t pt-3'>
        <Button type='button' variant='tertiary' size='sm' onClick={notRelated}>
          {HELM_COPY.groupingNotRelated}
        </Button>
        <Button type='button' variant='tertiary' size='sm' onClick={notNow}>
          {HELM_COPY.groupingNotNow}
        </Button>
      </div>
      <GroupingSourcesSheet
        grouping={grouping}
        isOpen={isListOpen}
        onClose={() => setIsListOpen(false)}
      />
    </section>
  );
}

export default GroupingCard;
