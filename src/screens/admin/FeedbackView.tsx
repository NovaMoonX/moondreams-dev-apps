import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { PillGroup } from '@/components/PillGroup';
import useNow from '@/hooks/useNow';
import { formatTimeAgo } from '@/utils/timeAgoUtils';
import { useAllFeedback } from '@hooks/useAllFeedback';
import {
  getContextPlaceName,
  getFirstLine,
  KIND_EMOJI,
  KIND_LABEL,
  sortByActivity,
} from '@lib/feedback/feedbackDisplay';
import type {
  Feedback,
  FeedbackKind,
  FeedbackStatus,
} from '@lib/feedback/types';

import { CARD_CLASS, LIST_CARD_CLASS } from './constants';
import FeedbackThreadSheet from './FeedbackThreadSheet';

type StatusFilter = 'open' | 'done' | 'wont-do' | 'all';
type KindFilter = FeedbackKind | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'wont-do', label: "Won't do" },
  { value: 'all', label: 'All' },
];

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'bug', label: 'Bugs' },
  { value: 'idea', label: 'Ideas' },
  { value: 'question', label: 'Questions' },
];

const OPEN_STATUSES: FeedbackStatus[] = ['new', 'looking', 'planned'];

const matchesStatus = (feedback: Feedback, filter: StatusFilter) =>
  filter === 'all' ||
  (filter === 'open'
    ? OPEN_STATUSES.includes(feedback.status)
    : feedback.status === filter);

const getSenderName = (feedback: Feedback) =>
  feedback.authorName ?? feedback.authorEmail ?? 'Someone';

interface FeedbackViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Everything people have sent, newest activity first; a row opens its thread. */
function FeedbackView({ selectedId, onSelect }: FeedbackViewProps) {
  const { items, status } = useAllFeedback(true);
  const now = useNow(60_000);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const visible = sortByActivity(items).filter(
    (item) =>
      matchesStatus(item, statusFilter) &&
      (kindFilter === 'all' || item.kind === kindFilter),
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const getEmptyText = () => {
    if (status === 'loading') return 'Loading feedback…';
    if (status === 'error' && items.length === 0) {
      return "We couldn't load feedback just now.";
    }
    return items.length === 0
      ? 'Nothing yet. When someone sends a bug, idea or question, it lands here.'
      : 'Nothing matches those filters.';
  };

  return (
    <div className='max-w-3xl space-y-4'>
      <div className='space-y-3'>
        <PillGroup
          label='Status'
          isThin
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <PillGroup
          label='Kind'
          isThin
          options={KIND_FILTERS}
          value={kindFilter}
          onChange={setKindFilter}
        />
      </div>

      {status === 'error' && items.length > 0 ? (
        <p role='status' className='text-muted-foreground text-sm'>
          We couldn&apos;t refresh just now, so this may be out of date.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className={join(CARD_CLASS, 'text-muted-foreground text-sm')}>
          {getEmptyText()}
        </p>
      ) : (
        <ul className={LIST_CARD_CLASS}>
          {visible.map((item) => (
            <li key={item.id}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                onClick={() => onSelect(item.id)}
              >
                <span aria-hidden='true' className='text-xl'>
                  {KIND_EMOJI[item.kind]}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground flex items-baseline justify-between gap-2 text-sm font-medium'>
                    <span className='truncate'>{getSenderName(item)}</span>
                    <span className='text-muted-foreground shrink-0 text-xs font-normal whitespace-nowrap'>
                      {formatTimeAgo(item.lastActivityAt, now)}
                    </span>
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {KIND_LABEL[item.kind]} ·{' '}
                    {getContextPlaceName(item.context)}
                  </span>
                  <span className='text-foreground mt-0.5 line-clamp-2 text-sm wrap-break-word'>
                    {getFirstLine(item.text)}
                  </span>
                </span>
                {item.isUnreadByAdmin ? (
                  <span
                    role='img'
                    aria-label='Unread'
                    className='bg-primary size-2.5 shrink-0 rounded-full'
                  />
                ) : null}
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FeedbackThreadSheet
        feedback={selected}
        senderName={selected ? getSenderName(selected) : ''}
        onClose={() => onSelect(null)}
      />
    </div>
  );
}

export default FeedbackView;
