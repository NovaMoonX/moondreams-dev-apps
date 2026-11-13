import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenTopic } from '@apps/helm/types';
import {
  buildTopicTree,
  legalParents,
  moveRefusal,
  pathOf,
  type TopicNode,
} from '@apps/helm/utils/topicTree';

interface TopicMoveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topic: OpenTopic;
  /** Called with the chosen parent, or null for the top level. */
  onPick: (parentId: string | null) => void;
}

const flatten = (nodes: TopicNode<OpenTopic>[]): OpenTopic[] =>
  nodes.flatMap((node) => [node.topic, ...flatten(node.children)]);

/** Where a topic may go: the top level and each topic it can legally sit under, never itself or what is under it. */
function TopicMoveSheet({
  isOpen,
  onClose,
  topic,
  onPick,
}: TopicMoveSheetProps) {
  const topics = useAppSelector(selectAllTopics);
  const legal = new Set(
    legalParents(topic.id, topics).map((entry) => entry.id),
  );
  const parents = flatten(buildTopicTree(topics)).filter((entry) =>
    legal.has(entry.id),
  );
  const isLimited = topics.some((entry) => {
    const refusal = moveRefusal(topic.id, entry.id, topics);
    return refusal === 'tooDeep' || refusal === 'tooMany';
  });
  const canGoToTop = moveRefusal(topic.id, null, topics) === null;

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.topicMoveTitle}
      isDrawerWhenShort
    >
      <div className='space-y-3'>
        {!canGoToTop && parents.length === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.topicMoveNone}
          </p>
        )}
        <ul className='divide-border divide-y'>
          {canGoToTop && (
            <li>
              <Button
                type='button'
                variant='tertiary'
                className='flex h-auto w-full min-w-0 flex-col items-start gap-0 rounded-none border-0 px-0 py-3 text-left'
                onClick={() => onPick(null)}
              >
                <span className='text-foreground text-[15px]'>
                  {HELM_COPY.topicMoveTop}
                </span>
                <span className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.topicMoveTopHint}
                </span>
              </Button>
            </li>
          )}
          {parents.map((parent) => (
            <li key={parent.id}>
              <Button
                type='button'
                variant='tertiary'
                className='flex h-auto w-full min-w-0 items-center justify-start gap-3 rounded-none border-0 px-0 py-3 text-left'
                onClick={() => onPick(parent.id)}
              >
                {parent.emoji && (
                  <span
                    className='w-7 shrink-0 text-center text-xl'
                    aria-hidden='true'
                  >
                    {parent.emoji}
                  </span>
                )}
                <span className='text-foreground min-w-0 flex-1 text-[15px] break-words'>
                  {pathOf(parent.id, topics).join(' › ')}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {isLimited && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.topicMoveLimits}
          </p>
        )}
      </div>
    </FormSheet>
  );
}

export default TopicMoveSheet;
