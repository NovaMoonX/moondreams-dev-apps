import { useCallback, useRef, useState, type ComponentType } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ChevronDown,
  ChevronRight,
  CircleArrowUp,
  Loader2,
  Megaphone,
  Wrench,
} from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SegmentedControl from '@/components/SegmentedControl';
import {
  groupByMonth,
  groupByVersion,
  isFixOnly,
  rollUp,
} from '@/lib/whatsNew/whatsNew';
import type { WhatsNewKind, WhatsNewNote } from '@/lib/whatsNew/whatsNewTypes';
import { formatDateShort } from '@/utils/formatUtils';

const KIND_LOOK: Record<
  WhatsNewKind,
  { word: string; Icon: ComponentType<{ className?: string }> }
> = {
  new: { word: 'New', Icon: Megaphone },
  improved: { word: 'Improved', Icon: CircleArrowUp },
  fixed: { word: 'Fixed', Icon: Wrench },
};

const HISTORY_VIEWS = [
  { value: 'highlights', label: 'Highlights' },
  { value: 'log', label: 'Every change' },
] as const;

type HistoryView = (typeof HISTORY_VIEWS)[number]['value'];

interface WhatsNewSheetProps {
  isOpen: boolean;
  title: string;
  scopeName: string;
  /** A pop-up holds what is unseen and ends in Got it; history holds everything and just closes. */
  mode: 'popup' | 'history';
  notes: WhatsNewNote[];
  /** History only: whether the feed is still loading or failed, so neither reads as "nothing new". */
  feedState?: 'loading' | 'failed' | 'ready';
  onRetry?: () => void;
  isDebug: boolean;
  onClose: () => void;
  onGotIt?: () => void;
  onCollapse?: () => void;
  onShowMe: (note: WhatsNewNote) => void;
  onStopFixOnly?: () => void;
}

function NoteRow({
  note,
  onShowMe,
}: {
  note: WhatsNewNote;
  onShowMe: (note: WhatsNewNote) => void;
}) {
  const { word, Icon } = KIND_LOOK[note.kind];
  const icon = (
    <Icon className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
  );
  const text = (
    <span className='block min-w-0 flex-1'>
      <span className='text-muted-foreground block text-xs'>{word}</span>
      <span className='text-foreground block text-sm text-pretty'>
        {note.text}
      </span>
    </span>
  );
  if (!note.path) {
    return (
      <li className='flex items-start gap-3 py-2'>
        {icon}
        {text}
      </li>
    );
  }
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`${note.text}, show me`}
        className='h-auto min-h-10 w-full items-start justify-start gap-3 !px-0 py-2 text-left font-normal'
        onClick={() => onShowMe(note)}
      >
        {icon}
        {text}
        <ChevronRight
          className='text-muted-foreground mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

function NoteList({
  notes,
  onShowMe,
}: {
  notes: WhatsNewNote[];
  onShowMe: (note: WhatsNewNote) => void;
}) {
  return (
    <ul className='divide-border divide-y'>
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} onShowMe={onShowMe} />
      ))}
    </ul>
  );
}

function FoldRow({
  label,
  isOpen,
  onToggle,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-muted-foreground relative w-full justify-center gap-1.5 text-sm font-normal before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]'
      onClick={onToggle}
    >
      {isOpen ? 'Show less' : label}
      <ChevronDown
        className={join('size-4', isOpen && 'rotate-180')}
        aria-hidden='true'
      />
    </Button>
  );
}

const countFixes = (count: number) =>
  `and ${count} ${count === 1 ? 'fix' : 'fixes'}`;

function VersionLog({
  notes,
  onShowMe,
}: {
  notes: WhatsNewNote[];
  onShowMe: (note: WhatsNewNote) => void;
}) {
  return (
    <div className='space-y-4'>
      {groupByVersion(notes).map((group) => (
        <section key={group.version}>
          <SectionDivider
            label={`Version ${group.version} · ${formatDateShort(group.publishedAt)}`}
          />
          <NoteList notes={group.notes} onShowMe={onShowMe} />
        </section>
      ))}
    </div>
  );
}

const formatMonth = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

/** The history's highlights: one heading per month, its fixes folded under it. */
function MonthList({
  notes,
  openFixMonths,
  onToggleFixes,
  onShowMe,
}: {
  notes: WhatsNewNote[];
  openFixMonths: string[];
  onToggleFixes: (key: string) => void;
  onShowMe: (note: WhatsNewNote) => void;
}) {
  return (
    <div className='space-y-4'>
      {groupByMonth(notes).map((month) => (
        <section key={month.key}>
          <SectionDivider label={formatMonth(month.at)} />
          <NoteList notes={month.highlights} onShowMe={onShowMe} />
          {month.fixes.length === 0 ? null : (
            <>
              {openFixMonths.includes(month.key) ? (
                <NoteList notes={month.fixes} onShowMe={onShowMe} />
              ) : null}
              <FoldRow
                label={countFixes(month.fixes.length)}
                isOpen={openFixMonths.includes(month.key)}
                onToggle={() => onToggleFixes(month.key)}
              />
            </>
          )}
        </section>
      ))}
    </div>
  );
}

/** The scrolling ancestor of the sheet's content: the drawer's body on a phone, the modal's from `sm`. */
const findScroller = (node: HTMLElement | null): HTMLElement | null => {
  const parent = node?.parentElement ?? null;
  if (!parent) return null;
  return /auto|scroll/.test(getComputedStyle(parent).overflowY)
    ? parent
    : findScroller(parent);
};

/**
 * What's new, read-only, in a drawer or modal. A pop-up shows what the person hasn't seen (a roll-up
 * of the best lines for most people, the full log for debug viewers); history shows what the feed holds.
 */
function WhatsNewSheet({
  isOpen,
  title,
  scopeName,
  mode,
  notes,
  feedState = 'ready',
  onRetry,
  isDebug,
  onClose,
  onGotIt,
  onCollapse,
  onShowMe,
  onStopFixOnly,
}: WhatsNewSheetProps) {
  const { confirm } = useActionModal();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isFixesOpen, setIsFixesOpen] = useState(false);
  const [openFixMonths, setOpenFixMonths] = useState<string[]>([]);
  const [view, setView] = useState<HistoryView>('highlights');
  const scrollTop = useRef(0);

  // The sheet stays mounted while collapsed, so where it was left is kept and put back on reopening.
  const keepScroll = useCallback((node: HTMLDivElement | null) => {
    const scroller = node && findScroller(node);
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = scrollTop.current;
    });
    const record = () => {
      scrollTop.current = scroller.scrollTop;
    };
    scroller.addEventListener('scroll', record, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', record);
    };
  }, []);

  const stopFixOnly = async () => {
    const isConfirmed = await confirm({
      title: 'Stop showing fix-only updates?',
      message:
        "You won't see a pop-up for updates that only fix things. Turn them back on in Manage your account, under Updates.",
      confirmText: 'Stop showing',
      cancelText: 'Keep showing',
    });
    if (isConfirmed) onStopFixOnly?.();
  };

  const isLog = isDebug && (mode === 'popup' || view === 'log');
  const rolled = rollUp(notes);

  const body = () => {
    if (mode === 'history' && feedState === 'loading') {
      return (
        <p className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Loader2 className='size-4 animate-spin' aria-hidden='true' />
          Looking for what changed…
        </p>
      );
    }
    if (mode === 'history' && feedState === 'failed') {
      return (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            Couldn't load what changed. Check your connection, then try again.
          </p>
          <Button type='button' variant='secondary' size='sm' onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
    }
    if (notes.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          {mode === 'history'
            ? `Nothing new in ${scopeName} yet. Changes show up here after an update.`
            : 'Nothing new here yet.'}
        </p>
      );
    }
    if (isLog) return <VersionLog notes={notes} onShowMe={onShowMe} />;
    if (mode === 'history') {
      return (
        <MonthList
          notes={notes}
          openFixMonths={openFixMonths}
          onToggleFixes={(key) =>
            setOpenFixMonths((open) =>
              open.includes(key)
                ? open.filter((openKey) => openKey !== key)
                : [...open, key],
            )
          }
          onShowMe={onShowMe}
        />
      );
    }
    return (
      <div className='space-y-2'>
        <NoteList
          notes={
            isMoreOpen
              ? [...rolled.highlights, ...rolled.moreHighlights]
              : rolled.highlights
          }
          onShowMe={onShowMe}
        />
        {rolled.moreHighlights.length > 0 ? (
          <FoldRow
            label={`and ${rolled.moreHighlights.length} more since ${formatDateShort(rolled.sinceAt ?? 0)}`}
            isOpen={isMoreOpen}
            onToggle={() => setIsMoreOpen((isOpen) => !isOpen)}
          />
        ) : null}
        {rolled.fixes.length === 0 ? null : (
          <>
            {isFixesOpen ? (
              <NoteList notes={rolled.fixes} onShowMe={onShowMe} />
            ) : null}
            <FoldRow
              label={countFixes(rolled.fixes.length)}
              isOpen={isFixesOpen}
              onToggle={() => setIsFixesOpen((isOpen) => !isOpen)}
            />
          </>
        )}
      </div>
    );
  };

  const footer = () => {
    if (mode === 'history') return undefined;
    const gotIt = (
      <Button type='button' size='lg' onClick={onGotIt}>
        Got it
      </Button>
    );
    if (!isDebug) {
      return (
        <div className='p-4'>
          <Button type='button' size='lg' className='w-full' onClick={onGotIt}>
            Got it
          </Button>
        </div>
      );
    }
    return (
      <div className='p-4'>
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              size='lg'
              onClick={onCollapse}
            >
              Collapse
            </Button>
          }
          rightActions={gotIt}
        />
      </div>
    );
  };

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={footer()}
      viewKey={mode === 'history' ? view : undefined}
    >
      <div
        ref={keepScroll}
        className={join('space-y-4', mode === 'history' && 'min-h-[55dvh]')}
      >
        {mode === 'history' && isDebug ? (
          <SegmentedControl
            label='What to show'
            options={HISTORY_VIEWS}
            value={view}
            onChange={setView}
            isCompact
          />
        ) : null}
        {body()}
        {mode === 'popup' && isDebug && isFixOnly(notes) && onStopFixOnly ? (
          <Button
            type='button'
            variant='tertiary'
            className='text-muted-foreground w-full justify-between px-0 text-sm font-normal'
            onClick={() => void stopFixOnly()}
          >
            Stop showing fix-only updates
            <ChevronRight className='size-4' aria-hidden='true' />
          </Button>
        ) : null}
      </div>
    </DetailSheet>
  );
}

export default WhatsNewSheet;
