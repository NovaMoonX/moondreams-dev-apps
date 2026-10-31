import { Button, Checkbox, Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { PillGroup } from '@/components/PillGroup';
import useNow from '@/hooks/useNow';
import { useClaudeRoutineStatus } from '@hooks/useClaudeRoutineStatus';
import { useFeedbackGroups } from '@hooks/useFeedbackGroups';
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

import ClaudeConnectionSheet from './ClaudeConnectionSheet';
import { CARD_CLASS, LIST_CARD_CLASS } from './constants';
import FeedbackGroupCard from './FeedbackGroupCard';
import FeedbackGroupSheet from './FeedbackGroupSheet';
import FeedbackThreadSheet from './FeedbackThreadSheet';

type StatusFilter = 'open' | 'done' | 'wont-do' | 'all';
type KindFilter = FeedbackKind | 'all';
/** `all`, `none` (not grouped), or a group's id. */
type GroupFilter = string;

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
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const { groups } = useFeedbackGroups(true);
  const { isConnected } = useClaudeRoutineStatus(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);

  const activeGroup = groups.find((group) => group.id === groupFilter) ?? null;
  const effectiveGroupFilter =
    groupFilter === 'all' || groupFilter === 'none' || activeGroup
      ? groupFilter
      : 'all';
  const groupNames = Object.fromEntries(
    groups.map((group) => [group.id, group.name]),
  );
  const visible = sortByActivity(items).filter(
    (item) =>
      matchesStatus(item, statusFilter) &&
      (kindFilter === 'all' || item.kind === kindFilter) &&
      (effectiveGroupFilter === 'all' ||
        (effectiveGroupFilter === 'none'
          ? item.groupId === null
          : item.groupId === effectiveGroupFilter)),
  );
  const groupItems = activeGroup
    ? items.filter((item) => item.groupId === activeGroup.id)
    : [];
  const groupOptions = [
    { text: 'All groups', value: 'all' },
    { text: 'Not grouped', value: 'none' },
    ...groups.map((group) => ({ text: group.name, value: group.id })),
  ];
  const checkedCount = checkedIds.length;

  const stopSelecting = () => {
    setIsSelecting(false);
    setCheckedIds([]);
  };
  const toggleChecked = (id: string) =>
    setCheckedIds((current) =>
      current.includes(id)
        ? current.filter((checkedId) => checkedId !== id)
        : [...current, id],
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
      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='base'
          size='sm'
          className="text-muted-foreground relative gap-1.5 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Sparkles className='size-4' aria-hidden='true' />
          {isConnected ? 'Claude connected' : 'Connect Claude'}
        </Button>
        <Button
          type='button'
          variant='base'
          size='sm'
          className="text-primary relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          onClick={() => (isSelecting ? stopSelecting() : setIsSelecting(true))}
        >
          {isSelecting ? 'Cancel' : 'Select'}
        </Button>
      </div>
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
        <Select
          aria-label='Group'
          options={groupOptions}
          value={effectiveGroupFilter}
          onChange={setGroupFilter}
        />
      </div>

      {activeGroup ? (
        <FeedbackGroupCard
          key={activeGroup.id}
          group={activeGroup}
          items={groupItems}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRemoved={() => setGroupFilter('all')}
        />
      ) : null}

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
            <li key={item.id} className='flex items-stretch'>
              {isSelecting ? (
                <span className='flex w-12 shrink-0 items-center justify-center pl-2'>
                  <Checkbox
                    checked={checkedIds.includes(item.id)}
                    onCheckedChange={() => toggleChecked(item.id)}
                    aria-label={`Select ${getSenderName(item)}`}
                  />
                </span>
              ) : null}
              <Button
                type='button'
                variant='tertiary'
                className={join(
                  'h-auto min-h-16 min-w-0 flex-1 justify-start gap-3 rounded-none py-3 text-left font-normal',
                  isSelecting ? 'pr-4! pl-2!' : 'px-4!',
                )}
                onClick={() =>
                  isSelecting ? toggleChecked(item.id) : onSelect(item.id)
                }
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
                    {item.groupId && groupNames[item.groupId]
                      ? ` · ${groupNames[item.groupId]}`
                      : ''}
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

      {isSelecting ? (
        <div className='bg-popover border-border sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border p-3 shadow-lg'>
          <p className='text-sm' role='status'>
            {checkedCount} selected
          </p>
          <Button
            type='button'
            size='sm'
            disabled={checkedCount === 0}
            onClick={() => setIsGroupSheetOpen(true)}
          >
            Add to group
          </Button>
        </div>
      ) : null}

      <FeedbackGroupSheet
        isOpen={isGroupSheetOpen}
        feedbackIds={checkedIds}
        groups={groups}
        currentGroupId={null}
        onClose={() => setIsGroupSheetOpen(false)}
        onDone={() => {
          setIsGroupSheetOpen(false);
          stopSelecting();
        }}
      />
      <ClaudeConnectionSheet
        isOpen={isSettingsOpen}
        isConnected={isConnected}
        onClose={() => setIsSettingsOpen(false)}
      />
      <FeedbackThreadSheet
        feedback={selected}
        senderName={selected ? getSenderName(selected) : ''}
        groups={groups}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onClose={() => onSelect(null)}
      />
    </div>
  );
}

export default FeedbackView;
