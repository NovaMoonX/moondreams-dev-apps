import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { BookmarkCheck } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { selectIsLearningOn } from '@apps/helm/store/selectors/patternSelectors';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { forgetTurnObservations } from '@apps/helm/store/actions/patternActions';

interface NotedRowProps {
  captureId: string;
  createdAt: number;
}

/** The quiet line under a turn that was only noted and left something behind: "Noted", with the promise to think it over tonight only while noticing is on and the turn is from today, and a way to take it back. */
function NotedRow({ captureId, createdAt }: NotedRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const isLearningOn = useAppSelector(selectIsLearningOn);
  const [isForgetting, setIsForgetting] = useState(false);
  const [forgotten, setForgotten] = useState<'kept' | 'removed' | 'none'>(
    'kept',
  );
  const isForgotten = forgotten !== 'kept';
  const isFromToday =
    new Date(createdAt).toDateString() === new Date().toDateString();

  const forget = async () => {
    if (!user || isForgetting) return;
    setIsForgetting(true);
    try {
      const wasKept = await forgetTurnObservations(user.uid, captureId);
      setForgotten(wasKept ? 'removed' : 'none');
    } catch (error) {
      console.error('Helm noted turn was not forgotten', error);
      addToast({ title: HELM_COPY.noticedOfferFailed, type: 'error' });
    } finally {
      setIsForgetting(false);
    }
  };

  return (
    <div className='flex w-full items-center gap-2 pl-[30px]'>
      <BookmarkCheck
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
      <p className='text-muted-foreground min-w-0 flex-1 text-[13px] text-pretty'>
        {forgotten === 'removed'
          ? HELM_COPY.notedForgotten
          : forgotten === 'none'
            ? HELM_COPY.notedNothingKept
            : isLearningOn && isFromToday
              ? HELM_COPY.notedLine(assistant)
              : HELM_COPY.notedLinePlain}
      </p>
      {!isForgotten && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="relative shrink-0 after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
          loading={isForgetting}
          onClick={() => void forget()}
        >
          {HELM_COPY.notedForgetIt}
        </Button>
      )}
    </div>
  );
}

export default NotedRow;
