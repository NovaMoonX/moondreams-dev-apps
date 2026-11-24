import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, History } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import EmptyCard from '@/components/EmptyCard';
import InlineNotice from '@/components/InlineNotice';
import SectionDivider from '@/components/SectionDivider';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/utils/formatUtils';

export interface DoneForYouDoor {
  label: string;
  subtitle?: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** The sentence shown instead of acting when what the door opens is gone. */
  unavailable?: string;
}

export interface DoneForYouEntry {
  id: string;
  createdAt: number;
  title: string;
  detail: string | null;
  whyLine: string | null;
  canUndo: boolean;
  isUndone: boolean;
  /** A muted line in the item, such as why its Undo is gone or the way back when there is none. */
  note: string | null;
  /** A short line on the row, such as that its Undo is gone. */
  rowNote: string | null;
  /** What the item's Undo button says; the sheet's `undo` word when null. */
  undoLabel: string | null;
  /** The row's leading picture, drawn at 40px; the kind icon in a tinted circle when missing. */
  mark?: ReactNode;
  /** A small glyph on the mark's corner saying what kind of thing was done. */
  kindIcon?: ReactNode;
  /** The corner glyph's words for a screen reader. */
  kindLabel?: string;
  /** A card under the title, such as what changed from and to. */
  hero?: ReactNode;
  doors?: readonly DoneForYouDoor[];
  undoneAt?: number | null;
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
    undoneAgo: (ago: string) => string;
    undoneNotice: (ago: string) => string;
    /** Shown when an Undo throws instead of answering. */
    undoFailed: string;
    today: string;
    yesterday: string;
  };
  /** Draws a line of the app's own text, for an app that masks some of it. */
  renderText?: (text: string) => ReactNode;
  /** Icon buttons on the title's line. */
  titleTrailing?: ReactNode;
  /** The entry to open on, such as the one a door's question came back from; it is read when the sheet mounts. */
  startId?: string | null;
}

const startOfDay = (time: number) => {
  const day = new Date(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
};

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
  startId = null,
}: DoneForYouSheetProps) {
  const [openId, setOpenId] = useState<string | null>(startId);
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

  const openDoor = (door: DoneForYouDoor) => {
    if (door.unavailable !== undefined) return;
    close();
    afterBackLayersClose(door.onSelect);
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

  const renderItem = (entry: DoneForYouEntry) => {
    const ago = formatTimeAgo(entry.createdAt, now);
    const undoneAgo =
      entry.undoneAt === null || entry.undoneAt === undefined
        ? ago
        : formatTimeAgo(entry.undoneAt, now, true);
    return (
      <div className='space-y-4'>
        <BackLink onBack={back} />
        <div className='space-y-1'>
          <p className='text-2xl font-semibold text-pretty'>
            {renderText(entry.title)}
          </p>
          {entry.detail !== null && !entry.isUndone && (
            <p className='text-muted-foreground text-sm'>
              {renderText(entry.detail)}
            </p>
          )}
          {entry.whyLine !== null && (
            <p className='text-muted-foreground text-sm'>
              {renderText(entry.whyLine)}
            </p>
          )}
          <p className='text-muted-foreground text-xs'>{ago}</p>
        </div>
        {entry.hero}
        {entry.doors !== undefined && entry.doors.length > 0 && (
          <div className='space-y-1'>
            {entry.doors.map((door) => (
              <ActionRow
                key={door.label}
                icon={door.icon}
                label={door.label}
                subtitle={door.unavailable ?? door.subtitle}
                hasChevron={door.unavailable === undefined}
                onClick={() => openDoor(door)}
              />
            ))}
          </div>
        )}
        {entry.canUndo && !entry.isUndone && (
          <Button
            type='button'
            variant='secondary'
            className='w-full'
            loading={isUndoing}
            onClick={() => void undo(entry.id)}
          >
            {entry.undoLabel ?? words.undo}
          </Button>
        )}
        {entry.isUndone && (
          <InlineNotice tone='info'>
            {words.undoneNotice(undoneAgo)}
          </InlineNotice>
        )}
        {!entry.isUndone && entry.note !== null && (
          <p className='text-muted-foreground text-sm'>{entry.note}</p>
        )}
        {failure !== null && (
          <InlineNotice tone='warning'>{failure}</InlineNotice>
        )}
      </div>
    );
  };

  const getRowLine = (entry: DoneForYouEntry) => {
    if (entry.isUndone) {
      const at = entry.undoneAt ?? entry.createdAt;
      return words.undoneAgo(formatTimeAgo(at, now, true));
    }
    const ago = formatTimeAgo(entry.createdAt, now);
    if (entry.rowNote !== null) return `${ago} \u00b7 ${entry.rowNote}`;
    return entry.detail === null ? ago : `${ago} \u00b7 ${entry.detail}`;
  };

  const renderRow = (entry: DoneForYouEntry) => {
    const hasMark = entry.mark !== undefined && entry.mark !== null;
    const line = getRowLine(entry);
    return (
      <Button
        key={entry.id}
        type='button'
        variant='tertiary'
        aria-label={`${entry.title}, ${line}`}
        onClick={() => setOpenId(entry.id)}
        className='border-border hover:bg-muted text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-2xl border px-3! py-2 text-left'
      >
        <span className='relative shrink-0'>
          {hasMark ? (
            <span className='grid size-10 place-items-center overflow-hidden rounded-xl'>
              {entry.mark}
            </span>
          ) : (
            <span
              className='bg-accent text-accent-foreground grid size-10 place-items-center rounded-full [&_svg]:size-5'
              aria-hidden='true'
            >
              {entry.kindIcon ?? <History />}
            </span>
          )}
          {hasMark && entry.kindIcon !== undefined && (
            <span className='bg-background border-background text-foreground absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full border-2 shadow-sm [&_svg]:size-3.5'>
              {entry.kindIcon}
              {entry.kindLabel !== undefined && (
                <span className='sr-only'>{entry.kindLabel}</span>
              )}
            </span>
          )}
        </span>
        <span className='min-w-0 flex-1'>
          <span
            className={join(
              'block text-base font-normal break-words',
              entry.isUndone && 'text-muted-foreground line-through',
            )}
          >
            {renderText(entry.title)}
          </span>
          <span className='text-muted-foreground line-clamp-2 text-sm font-normal'>
            {renderText(line)}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground mt-2.5 -ml-1 size-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
    );
  };

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
            {entries.map(renderRow)}
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
