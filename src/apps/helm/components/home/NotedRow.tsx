import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { BookmarkCheck } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { forgetTurnObservations } from '@apps/helm/store/actions/patternActions';

interface NotedRowProps {
  captureId: string;
}

/** The quiet line under a turn that was only noted: what happens next and a way to take it back. Drawn only while noticing is on, since it promises to think it over. */
function NotedRow({ captureId }: NotedRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const isLearningOn = useAppSelector(
    (state) => state.helm.profile?.isLearningOn ?? true,
  );
  const [isForgetting, setIsForgetting] = useState(false);
  const [isForgotten, setIsForgotten] = useState(false);
  if (!isLearningOn) return null;

  const forget = async () => {
    if (!user || isForgetting) return;
    setIsForgetting(true);
    try {
      await forgetTurnObservations(user.uid, captureId);
      setIsForgotten(true);
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
        {isForgotten
          ? HELM_COPY.notedForgotten
          : HELM_COPY.notedLine(assistant)}
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
