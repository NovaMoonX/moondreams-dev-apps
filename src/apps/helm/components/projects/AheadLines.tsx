import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Loader2 } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { readResearchArrival } from '@apps/helm/engine/research';
import { setAheadTold } from '@apps/helm/store/actions/aheadActions';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import { selectResearch } from '@apps/helm/store/selectors/researchSelectors';
import type { OpenProject } from '@apps/helm/types';

interface AheadLinesProps {
  project: OpenProject;
  onOpenTopic: (topicId: string) => void;
}

/** What a look started from an offer says on its project: a quiet line while it is being put together, and once, when it is in, that it was looked into with a way to open what it found. */
function AheadLines({ project, onOpenTopic }: AheadLinesProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const research = useAppSelector(selectResearch);
  const topics = useAppSelector(selectAllTopics);
  const taken = project.researchOffers.filter(
    (offer) => offer.state === 'taken' && offer.researchId !== null,
  );

  const told = (offerId: string) => {
    if (!user) return;
    setAheadTold(user.uid, project.id, offerId)?.catch((error: unknown) => {
      console.error('Helm ahead offer was not saved', error);
      addToast({ title: HELM_COPY.aheadActionFailed, type: 'error' });
    });
  };

  const lines = taken.flatMap((offer) => {
    const item = research.find((one) => one.id === offer.researchId);
    const subject = project.aheadAsks?.[offer.id]?.subject ?? item?.subject;
    if (!item || !subject) return [];
    if (
      item.status === 'planned' ||
      item.status === 'asking' ||
      item.status === 'preparing'
    ) {
      const arrival =
        HELM_COPY.aheadArrival[
          readResearchArrival(
            item.depth ?? 'light',
            item.prepareAt !== null ? 'later' : 'now',
          )
        ];
      return [
        <p
          key={offer.id}
          role='status'
          className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'
        >
          <Loader2
            className='mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none'
            aria-hidden='true'
          />
          <span className='min-w-0 break-words'>
            {HELM_COPY.aheadLooking(subject, arrival)}
          </span>
        </p>,
      ];
    }
    const topicId = item.resultTopicId;
    if (
      offer.toldAt !== null ||
      topicId === null ||
      !topics.some((topic) => topic.id === topicId)
    ) {
      return [];
    }
    return [
      <InlineNotice
        key={offer.id}
        tone='success'
        onDismiss={() => told(offer.id)}
        dismissLabel={HELM_COPY.aheadToldDismiss}
      >
        <p>{HELM_COPY.aheadTold(subject)}</p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='mt-1 -ml-2'
          onClick={() => {
            told(offer.id);
            onOpenTopic(topicId);
          }}
        >
          {HELM_COPY.aheadOpenIt}
        </Button>
      </InlineNotice>,
    ];
  });

  return lines.length > 0 ? <div className='space-y-2'>{lines}</div> : null;
}

export default AheadLines;
