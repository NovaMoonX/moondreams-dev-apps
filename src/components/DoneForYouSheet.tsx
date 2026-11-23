import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { History } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import EmptyCard from '@/components/EmptyCard';
import InlineNotice from '@/components/InlineNotice';
import SectionDivider from '@/components/SectionDivider';
import SummaryRow from '@/components/SummaryRow';
import { useNow } from '@/hooks/useNow';

export interface DoneForYouEntry {
  id: string;
  createdAt: number;
  title: string;
  detail: string | null;
  whyLine: string | null;
  canUndo: boolean;
  isUndone: boolean;
  /** A muted line in the item, such as why its Undo is gone. */
  note: string | null;
}

interface DoneForYouSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Any order; the sheet sorts newest first. */
  items: readonly DoneForYouEntry[];
  /** Resolves null once undone, or the sentence to show when it could not be. */
  onUndo: (id: string) => Promise<string | null>;
  words: {
    empty: string;
    emptyBody: string;
    undo: string;
    undone: string;
    /** Shown when an Undo throws instead of answering. */
    undoFailed: string;
    today: string;
    yesterday: string;
  };
  /** Draws a line of the app's own text, for an app that masks some of it. */
  renderText?: (text: string) => ReactNode;
  /** Icon buttons on the title's line. */
  titleTrailing?: ReactNode;
}

const startOfDay = (time: number) => {
  const day = new Date(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
};

const formatTime = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

/** What an app did on its own, newest first under day labels; each row opens its item, which holds the Undo. */
function DoneForYouSheet({
  isOpen,
  onClose,
  title,
  items,
  onUndo,
  words,
  renderText = (text) => text,
  titleTrailing,
}: DoneForYouSheetProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const now = useNow(60_000);
  const item = items.find((entry) => entry.id === openId) ?? null;

  const close = () => {
    setOpenId(null);
    setFailure(null);
    onClose();
  };

  const back = () => {
    setOpenId(null);
    setFailure(null);
  };

  const undo = async (id: string) => {
    setIsUndoing(true);
    setFailure(null);
    const sentence = await onUndo(id).catch(() => words.undoFailed);
    setIsUndoing(false);
    setFailure(sentence);
  };

  const today = startOfDay(now);
  const getDayLabel = (day: number) => {
    if (day === today) return words.today;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (day === yesterday.getTime()) return words.yesterday;
    return new Date(day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };
  const days = [...items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .reduce<{ day: number; entries: DoneForYouEntry[] }[]>((groups, entry) => {
      const day = startOfDay(entry.createdAt);
      const last = groups[groups.length - 1];
      if (last?.day === day) {
        return [
          ...groups.slice(0, -1),
          { day, entries: [...last.entries, entry] },
        ];
      }
      return [...groups, { day, entries: [entry] }];
    }, []);

  const renderItem = (entry: DoneForYouEntry) => (
    <div className='space-y-4'>
      <BackLink onBack={back} />
      <div className='space-y-1'>
        <p className='text-2xl font-semibold text-pretty'>
          {renderText(entry.title)}
        </p>
        {entry.detail !== null && (
          <p className='text-muted-foreground text-sm'>
            {renderText(entry.detail)}
          </p>
        )}
        {entry.whyLine !== null && (
          <p className='text-muted-foreground text-sm'>
            {renderText(entry.whyLine)}
          </p>
        )}
        <p className='text-muted-foreground text-xs'>
          {getDayLabel(startOfDay(entry.createdAt))},{' '}
          {formatTime(entry.createdAt)}
        </p>
      </div>
      {entry.canUndo && !entry.isUndone && (
        <Button
          type='button'
          variant='secondary'
          className='w-full'
          loading={isUndoing}
          onClick={() => void undo(entry.id)}
        >
          {words.undo}
        </Button>
      )}
      {entry.isUndone && (
        <p className='text-muted-foreground text-sm'>{words.undone}</p>
      )}
      {!entry.isUndone && entry.note !== null && (
        <p className='text-muted-foreground text-sm'>{entry.note}</p>
      )}
      {failure !== null && (
        <InlineNotice tone='warning'>{failure}</InlineNotice>
      )}
    </div>
  );

  const renderList = () => {
    if (days.length === 0) {
      return (
        <EmptyCard icon={<History className='h-5 w-5' />}>
          <span className='block font-medium'>{words.empty}</span>
          <span className='text-muted-foreground block'>{words.emptyBody}</span>
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {days.map(({ day, entries }) => (
          <div key={day} className='space-y-2'>
            <SectionDivider label={getDayLabel(day)} />
            {entries.map((entry) => (
              <SummaryRow
                key={entry.id}
                label={formatTime(entry.createdAt)}
                detail={
                  entry.isUndone
                    ? words.undone
                    : entry.detail === null
                      ? undefined
                      : renderText(entry.detail)
                }
                onClick={() => setOpenId(entry.id)}
              >
                {renderText(entry.title)}
              </SummaryRow>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={close}
      title={title}
      actions={titleTrailing}
      viewKey={item === null ? 'list' : `item-${item.id}`}
    >
      {item === null ? renderList() : renderItem(item)}
    </DetailSheet>
  );
}

export default DoneForYouSheet;
