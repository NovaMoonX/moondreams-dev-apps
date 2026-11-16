import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Loader2, Search } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import ResearchSheet from '@apps/helm/components/research/ResearchSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { cancelResearch } from '@apps/helm/store/actions/researchActions';
import { selectResearch } from '@apps/helm/store/selectors/researchSelectors';
import type { OpenExecution, OpenResearch } from '@apps/helm/types';

interface ResearchRowsProps {
  captureId: string;
  execution: OpenExecution;
}

const CARD_CLASS = 'helm-card ml-[30px] w-[calc(100%-30px)]';

function LookingRow({ research }: { research: OpenResearch }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const stop = () => {
    if (!user) return;
    cancelResearch(user.uid, research.id)
      .then(() => addToast({ title: HELM_COPY.researchCancelled }))
      .catch((error: unknown) => {
        console.error('Helm research was not cancelled', error);
        addToast({ title: HELM_COPY.researchSettingsFailed, type: 'error' });
      });
  };
  return (
    <div className={`${CARD_CLASS} space-y-2 px-3.5 py-3`} role='status'>
      <div className='flex items-start gap-2.5'>
        <Loader2
          className='text-muted-foreground mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
          {HELM_COPY.researchLookingInto(research.subject)}
        </span>
      </div>
      <div className='pl-[26px]'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="text-muted-foreground! relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
          onClick={stop}
        >
          {HELM_COPY.researchCancel}
        </Button>
      </div>
    </div>
  );
}

/** What a reply that asked for a look says: still looking (the reply above says when) with a quiet Stop looking, then a row that opens what it found; a stopped or unwanted one draws nothing. */
function ResearchRows({ captureId, execution }: ResearchRowsProps) {
  const all = useAppSelector(selectResearch);
  const [openId, setOpenId] = useState<string | null>(null);
  const ids = new Set(
    execution.effectRefs
      .filter((ref) => ref.collection === 'research')
      .map((ref) => ref.docId),
  );
  const items = all.filter(
    (one) =>
      (ids.has(one.id) || one.captureId === captureId) &&
      (one.status === 'preparing' ||
        one.status === 'ready' ||
        one.status === 'done'),
  );
  if (items.length === 0) return null;
  const opened = items.find((one) => one.id === openId) ?? null;

  return (
    <>
      {items.map((research) =>
        research.status === 'preparing' ? (
          <LookingRow key={research.id} research={research} />
        ) : (
          <div key={research.id} className={`${CARD_CLASS} overflow-hidden`}>
            <Button
              type='button'
              variant='base'
              className='focus-visible:outline-primary h-auto min-h-[52px] w-full justify-start gap-2.5 rounded-none px-3.5 py-3 text-left font-normal transition-none focus-visible:outline-2 focus-visible:-outline-offset-2'
              aria-label={HELM_COPY.researchOpen}
              onClick={() => setOpenId(research.id)}
            >
              <Search
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
                {HELM_COPY.researchIn(research.subject)}
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </div>
        ),
      )}
      <ResearchSheet research={opened} onClose={() => setOpenId(null)} />
    </>
  );
}

export default ResearchRows;
