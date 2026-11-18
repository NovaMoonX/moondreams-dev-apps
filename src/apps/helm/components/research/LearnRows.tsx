import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, GraduationCap } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import LearnItemSheet from '@apps/helm/components/research/LearnItemSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { selectLearnLater } from '@apps/helm/store/selectors/researchSelectors';
import type { OpenExecution } from '@apps/helm/types';

interface LearnRowsProps {
  execution: OpenExecution;
}

const isSameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** The row a reply leaves for each question it saved to learn later: what it is and that it waits on the list, opening the item. */
function LearnRows({ execution }: LearnRowsProps) {
  const items = useAppSelector(selectLearnLater);
  const now = useNow(60_000);
  const [openId, setOpenId] = useState<string | null>(null);
  const ids = new Set(
    execution.effectRefs
      .filter((ref) => ref.collection === 'research')
      .map((ref) => ref.docId),
  );
  const saved = items.filter((one) => ids.has(one.id));
  if (saved.length === 0) return null;

  return (
    <>
      {saved.map((item) => (
        <div
          key={item.id}
          className='helm-card ml-[30px] w-[calc(100%-30px)] overflow-hidden'
        >
          <Button
            type='button'
            variant='base'
            className='focus-visible:outline-primary h-auto min-h-[52px] w-full justify-start gap-2.5 rounded-none px-3.5 py-3 text-left font-normal transition-none focus-visible:outline-2 focus-visible:-outline-offset-2'
            aria-label={HELM_COPY.learnOpen(item.subject)}
            onClick={() => setOpenId(item.id)}
          >
            <GraduationCap
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 flex-1'>
              <span className='line-clamp-2 text-[15px] leading-[21px] break-words'>
                {item.subject}
              </span>
              <span className='text-muted-foreground block text-[13px] leading-[18px]'>
                {HELM_COPY.learnRowMeta(
                  isSameDay(item.createdAt, execution.createdAt) &&
                    isSameDay(item.createdAt, now)
                    ? HELM_COPY.learnToday
                    : formatDateShort(item.createdAt),
                )}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </div>
      ))}
      <LearnItemSheet itemId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default LearnRows;
