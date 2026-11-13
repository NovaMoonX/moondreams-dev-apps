import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  selectNotesByTopic,
  selectSubtopicsByParent,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenTopic } from '@apps/helm/types';

interface TopicRowProps {
  topic: OpenTopic;
  /** How far in the row sits under its parents: 0 at the top. */
  indent: 0 | 1 | 2;
  onOpen: (topicId: string) => void;
}

const INDENT = [
  'pl-4',
  "pl-8 before:absolute before:inset-y-0 before:left-7 before:w-px before:bg-border before:content-['']",
  "pl-12 before:absolute before:inset-y-0 before:left-7 before:w-px before:bg-border before:content-[''] after:absolute after:inset-y-0 after:left-11 after:w-px after:bg-border after:content-['']",
] as const;

/** One topic: its emoji and name, with how many subtopics and notes it holds. */
function TopicRow({ topic, indent, onOpen }: TopicRowProps) {
  const subtopics =
    useAppSelector(selectSubtopicsByParent).get(topic.id)?.length ?? 0;
  const notes = useAppSelector(selectNotesByTopic).get(topic.id)?.length ?? 0;
  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'relative flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 py-3 pr-4 text-left focus-visible:-outline-offset-2',
        INDENT[indent],
      )}
      onClick={() => onOpen(topic.id)}
    >
      {topic.emoji && (
        <span className='w-7 shrink-0 text-center text-2xl' aria-hidden='true'>
          {topic.emoji}
        </span>
      )}
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {topic.name}
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {HELM_COPY.topicCountLine(subtopics, notes)}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default TopicRow;
