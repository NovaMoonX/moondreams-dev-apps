import { useCallback, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Loader2 } from 'lucide-react';

import BackHeading from '@/components/BackHeading';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import {
  groupByMonth,
  groupByVersion,
  isFixOnly,
  rollUp,
} from '@/lib/whatsNew/whatsNew';
import type { WhatsNewLook } from '@/lib/whatsNew/whatsNewLooks';
import type { WhatsNewKind, WhatsNewNote } from '@/lib/whatsNew/whatsNewTypes';
import { formatDateShort } from '@/utils/formatUtils';

const KIND_WORDS: Record<WhatsNewKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

type SheetView = 'main' | 'all';

interface WhatsNewSheetProps {
  isOpen: boolean;
  title: string;
  scopeName: string;
  /** A pop-up holds what is unseen and ends in Got it; history holds everything and ends in Close. */
  mode: 'popup' | 'history';
  notes: WhatsNewNote[];
  look: WhatsNewLook;
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

function NoteMark({
  emoji,
  look,
  isSmall,
}: {
  emoji: string | null;
  look: WhatsNewLook;
  isSmall: boolean;
}) {
  if (look.mark === 'emoji') {
    return (
      <span
        className={join(
          'grid shrink-0 place-items-center leading-none',
          isSmall ? 'size-8 text-lg' : 'size-10 text-2xl',
        )}
        aria-hidden='true'
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      className={join(
        'grid shrink-0 place-items-center border leading-none',
        emoji === null
          ? 'border-transparent'
          : 'border-border bg-accent [text-shadow:0_0_1.5px_rgb(0_0_0/0.55)]',
        isSmall ? 'size-8 rounded-lg text-base' : 'size-10 rounded-xl text-lg',
      )}
      aria-hidden='true'
    >
      {emoji}
    </span>
  );
}

/** One note: the app's mark, the words and, when it opens something, a chevron across the whole row. */
function NoteRow({
  note,
  look,
  isCompact,
  hasMark,
  topLine,
  onShowMe,
}: {
  note: WhatsNewNote;
  look: WhatsNewLook;
  isCompact: boolean;
  hasMark: boolean;
  /** A muted line over the words, such as the kind or the version. */
  topLine: string | null;
  onShowMe: (note: WhatsNewNote) => void;
}) {
  const isCard = !isCompact && look.rows === 'cards';
  const isBullet = isCompact && note.kind === 'fixed';
  const shell = join(
    'flex w-full text-left',
    isBullet ? 'items-start gap-2.5' : 'items-center gap-3',
    isCard
      ? 'border-border rounded-2xl border px-3 py-3'
      : isCompact
        ? join('py-1.5', note.path && 'min-h-10')
        : 'min-h-12 py-2.5',
  );
  const mark = () => {
    if (isBullet) {
      return (
        <span
          className={join('flex h-5 shrink-0 items-center', topLine && 'mt-4')}
          aria-hidden='true'
        >
          <span className='bg-primary size-1.5 rounded-full' />
        </span>
      );
    }
    return hasMark ? (
      <NoteMark emoji={note.emoji} look={look} isSmall={isCompact} />
    ) : null;
  };
  const content = (
    <>
      {mark()}
      <span className='block min-w-0 flex-1'>
        {topLine ? (
          <span className='text-muted-foreground block text-xs'>{topLine}</span>
        ) : null}
        <span
          className={join(
            'text-foreground block text-pretty',
            isCompact ? 'text-sm' : 'text-base',
          )}
        >
          {note.text}
        </span>
      </span>
      {note.path ? (
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0 self-center'
          aria-hidden='true'
        />
      ) : null}
    </>
  );
  if (!note.path) {
    return (
      <li>
        <div className={shell}>{content}</div>
      </li>
    );
  }
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`${note.text}, show me`}
        className={join(
          shell,
          'text-foreground! h-auto justify-start font-normal',
          isCard ? 'hover:bg-muted rounded-2xl! px-3!' : 'rounded-none! px-0!',
        )}
        onClick={() => onShowMe(note)}
      >
        {content}
      </Button>
    </li>
  );
}

function NoteList({
  notes,
  look,
  isCompact,
  getTopLine,
  onShowMe,
}: {
  notes: WhatsNewNote[];
  look: WhatsNewLook;
  isCompact: boolean;
  getTopLine?: (note: WhatsNewNote) => string | null;
  onShowMe: (note: WhatsNewNote) => void;
}) {
  const hasMark = notes.some((note) => note.emoji !== null);
  const isCards = !isCompact && look.rows === 'cards';
  return (
    <ul
      className={
        isCards
          ? 'space-y-2'
          : isCompact
            ? 'space-y-1'
            : 'divide-border divide-y'
      }
    >
      {notes.map((note) => (
        <NoteRow
          key={note.id}
          note={note}
          look={look}
          isCompact={isCompact}
          hasMark={hasMark}
          topLine={getTopLine?.(note) ?? null}
          onShowMe={onShowMe}
        />
      ))}
    </ul>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className='space-y-2'>
      <SectionDivider label={label} />
      {children}
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className='text-foreground text-base font-semibold'>{children}</h3>
  );
}

const byKind = (notes: WhatsNewNote[], kind: WhatsNewKind) =>
  notes.filter((note) => note.kind === kind);

const formatMonth = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

const countMore = (count: number) =>
  `${count} more ${count === 1 ? 'change' : 'changes'}`;

/** The scrolling ancestor of the sheet's content: the drawer's body on a phone, the modal's from `sm`. */
const findScroller = (node: HTMLElement | null): HTMLElement | null => {
  const parent = node?.parentElement ?? null;
  if (!parent) return null;
  return /auto|scroll/.test(getComputedStyle(parent).overflowY)
    ? parent
    : findScroller(parent);
};

/**
 * What's new, read-only, in a drawer or modal, drawn in the app's own look. A pop-up tells what the
 * person would want to hear, with one door to every change; history holds what the feed holds, by month.
 */
function WhatsNewSheet({
  isOpen,
  title,
  scopeName,
  mode,
  notes: feedNotes,
  look,
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
  const [view, setView] = useState<SheetView>('main');
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
      message: (
        <>
          You won&apos;t see a pop-up for updates that only fix things. Turn
          them back on in <strong>Manage your account</strong>, under{' '}
          <strong>Updates</strong>.
        </>
      ),
      confirmText: 'Stop showing',
      cancelText: 'Keep showing',
    });
    if (isConfirmed) onStopFixOnly?.();
  };

  const notes = isDebug
    ? feedNotes
    : feedNotes.map((note) =>
        note.kind === 'fixed' ? { ...note, path: null } : note,
      );
  const rolled = rollUp(notes);
  const restCount = rolled.total - rolled.told.length;
  const isOneRelease = new Set(notes.map((note) => note.version)).size <= 1;
  const sinceDate = isOneRelease ? null : formatDateShort(rolled.sinceAt ?? 0);
  const sinceLine = sinceDate ? `Since ${sinceDate}` : null;
  const restLabel = sinceDate
    ? `${countMore(restCount)} since ${sinceDate}`
    : countMore(restCount);
  const getVersionLine = (note: WhatsNewNote) =>
    isDebug ? `Version ${note.version}` : null;

  const toldSections = (list: WhatsNewNote[]) =>
    (['new', 'improved'] as const)
      .map((kind) => ({ kind, list: byKind(list, kind) }))
      .filter((group) => group.list.length > 0)
      .map((group) => (
        <Section key={group.kind} label={KIND_WORDS[group.kind]}>
          <NoteList
            notes={group.list}
            look={look}
            isCompact={false}
            getTopLine={getVersionLine}
            onShowMe={onShowMe}
          />
        </Section>
      ));

  // Tiles belong to the pop-up's first screen; every other view lists changes as plain rows.
  const kindSections = (
    groups: { key: string; label: string; list: WhatsNewNote[] }[],
    getTopLine: (note: WhatsNewNote) => string | null,
  ) =>
    groups
      .filter((group) => group.list.length > 0)
      .map((group) => (
        <Section key={group.key} label={group.label}>
          <NoteList
            notes={group.list}
            look={look}
            isCompact
            getTopLine={getTopLine}
            onShowMe={onShowMe}
          />
        </Section>
      ));

  const everyKind = (
    list: WhatsNewNote[],
    smaller: WhatsNewNote[],
    fixes: WhatsNewNote[],
  ) => [
    { key: 'new', label: 'New', list: byKind(list, 'new') },
    { key: 'improved', label: 'Improved', list: byKind(list, 'improved') },
    { key: 'smaller', label: 'Smaller changes', list: smaller },
    { key: 'fixes', label: 'Fixes', list: fixes },
  ];

  const theRest = () => (
    <div className='space-y-5'>
      {kindSections(
        everyKind(rolled.moreTold, rolled.smaller, rolled.fixes),
        getVersionLine,
      )}
    </div>
  );

  const versionLog = () => (
    <div className='space-y-8'>
      {groupByVersion(notes).map((group) => (
        <section key={group.version} className='space-y-3'>
          <Heading>{`Version ${group.version} · ${formatDateShort(group.publishedAt)}`}</Heading>
          {isFixOnly(group.notes) ? (
            <NoteList
              notes={group.notes}
              look={look}
              isCompact
              onShowMe={onShowMe}
            />
          ) : (
            kindSections(
              everyKind(
                group.notes.filter((note) => note.isTold),
                group.notes.filter(
                  (note) => !note.isTold && note.kind !== 'fixed',
                ),
                byKind(group.notes, 'fixed'),
              ),
              () => null,
            )
          )}
        </section>
      ))}
    </div>
  );

  const history = () => (
    <div className='space-y-8'>
      {groupByMonth(notes).map((month) => (
        <section key={month.key} className='space-y-3'>
          <Heading>{formatMonth(month.at)}</Heading>
          {kindSections(
            everyKind(month.told, month.smaller, month.fixes),
            getVersionLine,
          )}
        </section>
      ))}
    </div>
  );

  const isDoorShown =
    mode === 'popup' &&
    view === 'main' &&
    rolled.told.length > 0 &&
    rolled.told.length < rolled.total;

  const popup = () =>
    rolled.told.length === 0 ? (
      versionLog()
    ) : (
      <div className='space-y-5'>{toldSections(rolled.told)}</div>
    );

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
    if (mode === 'history') return history();
    if (view === 'all') {
      return (
        <div className='space-y-5'>
          <BackHeading onBack={() => setView('main')} title={restLabel} />
          {theRest()}
        </div>
      );
    }
    return popup();
  };

  const door = isDoorShown ? (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! hover:bg-muted mb-2 h-auto min-h-11 w-full justify-between! rounded-xl! px-3! text-left text-base font-normal'
      onClick={() => setView('all')}
    >
      <span className='block min-w-0'>
        <span className='block'>{`See ${countMore(restCount)}`}</span>
        {sinceLine ? (
          <span className='text-muted-foreground block text-sm'>
            {sinceLine}
          </span>
        ) : null}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  ) : null;

  const footer = () => {
    if (mode === 'history') {
      return (
        <div className='p-4'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='w-full'
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      );
    }
    if (!isDebug) {
      return (
        <div className='p-4'>
          {door}
          <Button type='button' size='lg' className='w-full' onClick={onGotIt}>
            Got it
          </Button>
        </div>
      );
    }
    return (
      <div className='p-4'>
        {door}
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
          rightActions={
            <Button type='button' size='lg' onClick={onGotIt}>
              Got it
            </Button>
          }
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
      viewKey={mode === 'popup' ? view : undefined}
    >
      <div
        ref={keepScroll}
        className={join('space-y-4', mode === 'history' && 'min-h-[55dvh]')}
      >
        {body()}
        {mode === 'popup' && isDebug && isFixOnly(notes) && onStopFixOnly ? (
          <Button
            type='button'
            variant='tertiary'
            className='text-muted-foreground w-full justify-between !px-0 text-sm font-normal'
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
