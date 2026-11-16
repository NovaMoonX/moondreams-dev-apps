import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, GraduationCap } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import LearnItemSheet from '@apps/helm/components/research/LearnItemSheet';
import { HELM_COPY, KNOWLEDGE_SEARCH_FROM } from '@apps/helm/constants';
import { selectLearnLater } from '@apps/helm/store/selectors/researchSelectors';
import type { OpenResearch } from '@apps/helm/types';

interface LearnLaterListProps {
  onClose: () => void;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const toStatusLine = (item: OpenResearch) =>
  item.status === 'planned' && item.prepareFailedAt !== null
    ? HELM_COPY.learnFailed
    : item.status === 'planned' || item.status === 'preparing'
      ? HELM_COPY.learnPreparing
      : HELM_COPY.learnSavedLine(
          formatDateShort(item.createdAt),
          item.contextLine,
        );

/** Everything saved to learn later, newest first: each row is one line of what it is and when it was saved, and opens the item's sheet where its actions live. */
function LearnLaterList({ onClose }: LearnLaterListProps) {
  const items = useAppSelector(selectLearnLater);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown =
    items.length >= KNOWLEDGE_SEARCH_FROM && words.length > 0
      ? items.filter((item) => {
          const text = fold(
            [item.subject, item.question, ...item.moreAsked].join(' '),
          );
          return words.every((word) => text.includes(word));
        })
      : items;

  return (
    <>
      <Subview overlay title={HELM_COPY.learnLaterTitle} onClose={onClose}>
        <div className='space-y-4'>
          {items.length >= KNOWLEDGE_SEARCH_FROM && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={HELM_COPY.learnSearch}
            />
          )}
          {items.length === 0 ? (
            <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
              {HELM_COPY.learnEmpty}
            </p>
          ) : shown.length === 0 ? (
            <p className='text-muted-foreground text-[15px]'>
              {HELM_COPY.learnNoMatch}
            </p>
          ) : (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {shown.map((item) => (
                <li key={item.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                    aria-label={HELM_COPY.learnOpen(item.subject)}
                    onClick={() => setOpenId(item.id)}
                  >
                    <GraduationCap
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground line-clamp-2 text-[15px] leading-[21px] break-words'>
                        {item.subject}
                      </span>
                      <span className='text-muted-foreground line-clamp-2 text-[13px] leading-[18px] break-words'>
                        {toStatusLine(item)}
                      </span>
                    </span>
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Subview>
      <LearnItemSheet itemId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default LearnLaterList;
