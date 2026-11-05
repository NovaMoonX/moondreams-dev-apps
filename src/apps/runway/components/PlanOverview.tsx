import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

import Pill from '@/components/Pill';
import { PillRow } from '@/components/PillGroup';
import SegmentedControl from '@/components/SegmentedControl';
import SensitiveValue from '@/components/SensitiveValue';
import { useNow } from '@/hooks/useNow';
import { usePullDown } from '@/hooks/usePullDown';
import { useRestartApp } from '@/hooks/useRestartApp';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import {
  PLAN_OVERVIEW_WORDS as WORDS,
  PLAN_SECTION_LABELS,
  PLAN_VIEW_EMOJI,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  usePlanOverview,
  type FigureSegment,
  type OverviewMode,
} from '@apps/runway/hooks/usePlanOverview';
import type { PlanSection } from '@apps/runway/types';

type ViewSection = Exclude<PlanSection, 'more'>;
type Level = 0 | 1 | 2;

/** Extra travel after the grid is fully shown before the refresh ring starts, so the last step is felt. */
const STEP_GAP_PX = 16;
const REFRESH_EXTRA_MIN_PX = 72;
const CIRCLE_PX = 40;
const CIRCLE_REST_PX = 64;
const NOTE_GAP_PX = 12;
const MOTION_MIN_MS = 180;
const MOTION_MAX_MS = 360;
const SCROLL_SETTLE_MS = 120;
const REFRESH_RESET_MS = 1500;
const RING_RADIUS = 11;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The closed and opened rows that hold View all share one height, so the button never moves between them. */
const BUTTON_ROW_CLASS = 'flex min-h-8 items-center gap-2';

const MODE_OPTIONS = WORDS.modes.map(({ value, label }) => ({ value, label }));

const toText = (segments: FigureSegment[], isHidden: boolean) =>
  segments
    .map((segment) =>
      typeof segment === 'string'
        ? segment
        : isHidden
          ? 'hidden amount'
          : segment.private,
    )
    .join('');

function Figure({
  segments,
  isWhole = false,
}: {
  segments: FigureSegment[];
  isWhole?: boolean;
}) {
  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === 'string' ? (
          segment
        ) : (
          <SensitiveValue
            key={index}
            className={join(
              'text-foreground font-semibold',
              isWhole && 'whitespace-nowrap',
            )}
          >
            {segment.private}
          </SensitiveValue>
        ),
      )}
    </>
  );
}

interface OverviewTileProps {
  name: string;
  emoji: string;
  segments: FigureSegment[];
  isCurrent: boolean;
  className?: string;
  onOpen: () => void;
}

function OverviewTile({
  name,
  emoji,
  segments,
  isCurrent,
  className,
  onOpen,
}: OverviewTileProps) {
  const { isHidden } = useValuesHidden();
  return (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      rounded='lg'
      aria-label={WORDS.tileAria(name, toText(segments, isHidden))}
      aria-current={isCurrent ? 'true' : undefined}
      onClick={onOpen}
      className={join(
        'bg-(--color-card)! border-border text-foreground! hover:bg-muted! flex h-full min-h-[4.5rem] w-full min-w-0 flex-col items-start justify-start gap-1 border px-3 py-2 text-left font-normal whitespace-normal',
        isCurrent && 'border-primary',
        className,
      )}
    >
      <span className='flex w-full items-center gap-1.5 text-sm font-medium'>
        <span aria-hidden='true'>{emoji}</span>
        <span className='truncate'>{name}</span>
      </span>
      <span className='text-muted-foreground line-clamp-3 text-xs'>
        <Figure segments={segments} />
      </span>
    </Button>
  );
}

function RefreshRing({
  progress,
  isSpinning,
  isReady,
}: {
  progress: number;
  isSpinning: boolean;
  isReady: boolean;
}) {
  return (
    <svg
      viewBox='0 0 28 28'
      className={join('size-6 -rotate-90', isSpinning && 'animate-spin')}
      aria-hidden='true'
    >
      <circle
        cx='14'
        cy='14'
        r={RING_RADIUS}
        fill='none'
        strokeWidth='3'
        strokeLinecap='round'
        className={isReady ? 'stroke-primary-foreground' : 'stroke-primary'}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - (isSpinning ? 0.75 : progress))}
      />
    </svg>
  );
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PillLook extends Box {
  background: string;
  border: string;
  color: string;
  hasEmoji: boolean;
}

interface Measures {
  closed: number;
  row: number;
  grid: number;
  pillsBox: number;
  rowBox: number;
  gridBox: number;
  note: number;
  pills: PillLook[];
  rowTiles: Box[];
  gridTiles: Box[];
}

const FALLBACK: Measures = {
  closed: 72,
  row: 170,
  grid: 330,
  pillsBox: 24,
  rowBox: 80,
  gridBox: 240,
  note: 0,
  pills: [],
  rowTiles: [],
  gridTiles: [],
};

const ROW_CLASS =
  'relative flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain pb-1';
const ROW_TILE_CLASS = 'w-[44%] shrink-0 lg:w-[calc((100%-1rem)/3)]';
const GRID_CLASS =
  'relative grid auto-rows-fr grid-cols-2 gap-2 lg:grid-cols-3 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2';

const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const isMotionReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const readBoxes = (node: HTMLElement | null) =>
  Array.from(node?.children ?? []).map((child) => {
    const element = child as HTMLElement;
    return {
      left: element.offsetLeft,
      top: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    };
  });

/** Each pill's box within the pill row (unscrolled) and the colours it is drawn in, so a pill can grow into its tile. */
const readPills = (node: HTMLElement | null): PillLook[] => {
  if (!node) return [];
  const origin = node.getBoundingClientRect();
  return Array.from(node.querySelectorAll<HTMLElement>('[data-pill]')).map(
    (pill) => {
      const box = pill.getBoundingClientRect();
      const style = getComputedStyle(pill);
      const emoji = pill.querySelector<HTMLElement>('[data-pill-emoji]');
      return {
        left: box.left - origin.left,
        top: box.top - origin.top,
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        border: style.borderTopColor,
        color: style.color,
        hasEmoji: (emoji?.offsetWidth ?? 0) > 0,
      };
    },
  );
};

const blend = (from: string, to: string, t: number) =>
  `color-mix(in oklab, ${from} ${Math.round((1 - t) * 100)}%, ${to})`;

interface Motion {
  /** Where the top starts moving from, on the finger's line; null when the step is shown at rest. */
  from: number;
  key: number;
}

interface OverviewItem {
  key: string;
  emoji: string;
  name: string;
  figure: ReactNode;
  isCurrent: boolean;
  node: ReactNode;
}

interface PullFrameProps {
  /** The line over the pills and tiles; `reveal` runs from 0 (pills) to 1 (tiles shown). */
  controls: (reveal: number) => ReactNode;
  pills: ReactNode;
  items: OverviewItem[];
  note: ReactNode;
  settled: Level;
  motion: Motion | null;
  isRefreshing: boolean;
  positionRef: { current: number };
  onSettle: (level: Level, from: number | null) => void;
  onMotionEnd: () => void;
  onRefresh: () => void;
}

/** The pull and its steps: the pills, which grow into a sideways row of tiles, then the tiles moving one by one into their grid places, then a refresh circle over the page. Every step and tile is measured up front, so the finger and a tap move them along one line. */
function PullFrame({
  controls,
  pills,
  items,
  note,
  settled,
  motion,
  isRefreshing,
  positionRef,
  onSettle,
  onMotionEnd,
  onRefresh,
}: PullFrameProps) {
  const [measures, setMeasures] = useState<Measures>(FALLBACK);
  const [tween, setTween] = useState<{ key: number; at: number } | null>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<{
    closed: HTMLDivElement | null;
    row: HTMLDivElement | null;
    grid: HTMLDivElement | null;
    pillsBox: HTMLDivElement | null;
    rowBox: HTMLDivElement | null;
    gridBox: HTMLDivElement | null;
    note: HTMLDivElement | null;
  }>({
    closed: null,
    row: null,
    grid: null,
    pillsBox: null,
    rowBox: null,
    gridBox: null,
    note: null,
  });
  const [rowScroll, setRowScroll] = useState(0);
  const [pillScroll, setPillScroll] = useState(0);
  const pillTimerRef = useRef(0);
  const scrollTimerRef = useRef(0);
  const pendingShiftRef = useRef(0);

  const rowAt = measures.row - measures.closed;
  const gridAt = measures.grid - measures.closed + STEP_GAP_PX;
  const positions: Record<Level, number> = { 0: 0, 1: rowAt, 2: gridAt };
  const refreshAt = Math.max(
    gridAt + REFRESH_EXTRA_MIN_PX,
    window.innerHeight / 2,
  );
  const getLevelAt = (position: number): Level => {
    if (position >= (rowAt + gridAt) / 2) return 2;
    return position >= rowAt / 2 ? 1 : 0;
  };

  const { distance, isPulling } = usePullDown({
    isEnabled: motion === null,
    canPullUp: settled > 0,
    refreshAt: refreshAt - positions[settled],
    onRefresh: () => {
      onSettle(2, positionRef.current);
      onRefresh();
    },
    onRelease: (travelled) => {
      const released = Math.max(0, positions[settled] + travelled);
      onSettle(getLevelAt(released), released);
    },
  });

  const position = isPulling
    ? Math.max(0, positions[settled] + distance)
    : motion
      ? tween?.key === motion.key
        ? tween.at
        : motion.from
      : positions[settled];
  const isMoving = isPulling || motion !== null;
  useEffect(() => {
    positionRef.current = position;
  });

  const target = positions[settled];
  const motionKey = motion?.key;
  const motionFrom = motion?.from;
  useEffect(() => {
    if (motionKey === undefined || motionFrom === undefined) return;
    const startedAt = performance.now();
    const duration = Math.min(
      MOTION_MAX_MS,
      MOTION_MIN_MS + Math.abs(target - motionFrom),
    );
    const frame = { id: 0 };
    const step = (now: number) => {
      const done = Math.min(1, (now - startedAt) / duration);
      if (done >= 1) {
        setTween(null);
        onMotionEnd();
        return;
      }
      setTween({
        key: motionKey,
        at: mix(motionFrom, target, easeOut(done)),
      });
      frame.id = requestAnimationFrame(step);
    };
    frame.id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.id);
  }, [motionKey, motionFrom, target, onMotionEnd]);

  useLayoutEffect(() => {
    if (pendingShiftRef.current > 0) {
      window.scrollBy(0, -pendingShiftRef.current);
      pendingShiftRef.current = 0;
    }
  });

  useEffect(() => {
    const measure = () =>
      setMeasures((previous) => {
        const nodes = measureRefs.current;
        const next: Measures = {
          closed: nodes.closed?.offsetHeight ?? previous.closed,
          row: nodes.row?.offsetHeight ?? previous.row,
          grid: nodes.grid?.offsetHeight ?? previous.grid,
          pillsBox: nodes.pillsBox?.offsetHeight ?? previous.pillsBox,
          rowBox: nodes.rowBox?.offsetHeight ?? previous.rowBox,
          gridBox: nodes.gridBox?.offsetHeight ?? previous.gridBox,
          note: nodes.note?.offsetHeight ?? 0,
          pills: readPills(nodes.pillsBox),
          rowTiles: readBoxes(nodes.rowBox),
          gridTiles: readBoxes(nodes.gridBox),
        };
        return JSON.stringify(next) === JSON.stringify(previous)
          ? previous
          : next;
      });
    const observer = new ResizeObserver(measure);
    Object.values(measureRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (settled === 0) return;
    const fold = () => {
      const clip = clipRef.current;
      if (!clip || clip.getBoundingClientRect().bottom >= 0) return;
      pendingShiftRef.current = Math.max(
        0,
        clip.offsetHeight - measures.closed,
      );
      onSettle(0, null);
    };
    window.addEventListener('scroll', fold, { passive: true });
    return () => window.removeEventListener('scroll', fold);
  }, [settled, measures.closed, onSettle]);

  const restoreRowScroll = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && node.scrollLeft !== rowScroll) node.scrollLeft = rowScroll;
    },
    [rowScroll],
  );
  const restorePillScroll = useCallback(
    (node: HTMLDivElement | null) => {
      const scroller = Array.from(node?.querySelectorAll('*') ?? []).find(
        (element) => element.scrollWidth > element.clientWidth,
      );
      if (scroller && scroller.scrollLeft !== pillScroll)
        scroller.scrollLeft = pillScroll;
    },
    [pillScroll],
  );
  const livePills = (
    <div
      ref={restorePillScroll}
      onScrollCapture={(event) => {
        const left = (event.target as HTMLElement).scrollLeft;
        window.clearTimeout(pillTimerRef.current);
        pillTimerRef.current = window.setTimeout(
          () => setPillScroll(left),
          SCROLL_SETTLE_MS,
        );
      }}
    >
      {pills}
    </div>
  );
  const row = (
    <div
      ref={restoreRowScroll}
      data-no-swipe
      className={ROW_CLASS}
      role='group'
      aria-label={WORDS.tilesLabel}
      onScroll={(event) => {
        const left = event.currentTarget.scrollLeft;
        window.clearTimeout(scrollTimerRef.current);
        // Kept once the row comes to rest, so a fling never re-renders the frame on every scroll event; read now, since a pull can unmount the row first.
        scrollTimerRef.current = window.setTimeout(
          () => setRowScroll(left),
          SCROLL_SETTLE_MS,
        );
      }}
    >
      {items.map(({ key, node }) => (
        <div key={key} className={ROW_TILE_CLASS}>
          {node}
        </div>
      ))}
    </div>
  );
  const grid = (
    <div className={GRID_CLASS} role='group' aria-label={WORDS.tilesLabel}>
      {items.map(({ key, node }) => (
        <div key={key}>{node}</div>
      ))}
    </div>
  );
  // Tiles further left are drawn over the ones after them wherever two cross.
  const stackAt = (index: number) => items.length - index;
  // Each pill grows in place into its tile: its box, corners, colours and words move from the pill's to the tile's.
  const grow = (progress: number) => (
    <div
      className='relative overflow-hidden'
      style={{ height: mix(measures.pillsBox, measures.rowBox, progress) }}
      aria-hidden='true'
    >
      {items.map(({ key, emoji, name, figure, isCurrent }, index) => {
        const from = measures.pills[index];
        const to = measures.rowTiles[index];
        if (!from || !to) return null;
        const tileBorder = isCurrent
          ? 'var(--color-primary)'
          : 'var(--color-border)';
        return (
          <div
            key={key}
            className='absolute overflow-hidden border'
            style={{
              zIndex: stackAt(index),
              left: mix(from.left - pillScroll, to.left - rowScroll, progress),
              top: mix(from.top, to.top, progress),
              width: mix(from.width, to.width, progress),
              height: mix(from.height, to.height, progress),
              borderRadius: mix(from.height / 2, 8, progress),
              background: blend(from.background, 'var(--color-card)', progress),
              borderColor: blend(from.border, tileBorder, progress),
              padding: `${mix((from.height - 18) / 2, 8, progress)}px ${mix(10, 12, progress)}px`,
            }}
          >
            <span
              className='flex items-center font-medium whitespace-nowrap'
              style={{
                fontSize: mix(12, 14, progress),
                lineHeight: `${mix(16, 20, progress)}px`,
                color: blend(from.color, 'var(--color-foreground)', progress),
              }}
            >
              <span
                className='inline-block overflow-hidden'
                style={{
                  maxWidth: from.hasEmoji ? 20 : mix(0, 20, progress),
                  marginRight: from.hasEmoji ? 6 : mix(0, 6, progress),
                  opacity: from.hasEmoji ? 1 : progress,
                }}
              >
                {emoji}
              </span>
              <span className='truncate'>{name}</span>
            </span>
            <span
              className='text-muted-foreground mt-1 line-clamp-3 text-xs'
              style={{ opacity: Math.max(0, (progress - 0.4) / 0.6) }}
            >
              {figure}
            </span>
          </div>
        );
      })}
    </div>
  );
  // Between the row and the grid each tile is placed by hand, from where it sits in the row (as scrolled) to its grid cell.
  const morph = (progress: number) => (
    <div
      className='relative overflow-hidden'
      style={{ height: mix(measures.rowBox, measures.gridBox, progress) }}
      role='group'
      aria-label={WORDS.tilesLabel}
    >
      {items.map(({ key, node }, index) => {
        const from = measures.rowTiles[index];
        const to = measures.gridTiles[index];
        if (!from || !to) return null;
        return (
          <div
            key={key}
            className='absolute'
            style={{
              zIndex: stackAt(index),
              left: mix(from.left - rowScroll, to.left, progress),
              top: mix(from.top, to.top, progress),
              width: mix(from.width, to.width, progress),
              height: mix(from.height, to.height, progress),
            }}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
  const noteAt = (progress: number) =>
    note ? (
      <div
        className='overflow-hidden'
        style={{
          marginTop: mix(0, NOTE_GAP_PX, progress),
          height: progress < 1 ? mix(0, measures.note, progress) : undefined,
          opacity: progress,
        }}
      >
        {note}
      </div>
    ) : null;
  // The hidden copies are measured, never shown, so a tween's frames leave them alone.
  const measuring = useMemo(
    () => (
      <div
        aria-hidden='true'
        inert
        className='pointer-events-none invisible absolute inset-x-0 top-0'
      >
        <div
          ref={(node) => {
            measureRefs.current.closed = node;
          }}
          className='absolute inset-x-0 top-0 space-y-3'
        >
          {controls(0)}
          <div
            ref={(node) => {
              measureRefs.current.pillsBox = node;
            }}
          >
            {pills}
          </div>
        </div>
        <div
          ref={(node) => {
            measureRefs.current.row = node;
          }}
          className='absolute inset-x-0 top-0'
        >
          {controls(1)}
          <div
            ref={(node) => {
              measureRefs.current.rowBox = node;
            }}
            className={join(ROW_CLASS, 'mt-3')}
          >
            {items.map(({ key, node }) => (
              <div key={key} className={ROW_TILE_CLASS}>
                {node}
              </div>
            ))}
          </div>
          {note && (
            <div
              ref={(node) => {
                measureRefs.current.note = node;
              }}
              style={{ marginTop: NOTE_GAP_PX }}
            >
              {note}
            </div>
          )}
        </div>
        <div
          ref={(node) => {
            measureRefs.current.grid = node;
          }}
          className='absolute inset-x-0 top-0'
        >
          {controls(1)}
          <div
            ref={(node) => {
              measureRefs.current.gridBox = node;
            }}
            className={join(GRID_CLASS, 'mt-3')}
          >
            {items.map(({ key, node }) => (
              <div key={key}>{node}</div>
            ))}
          </div>
          {note && <div style={{ marginTop: NOTE_GAP_PX }}>{note}</div>}
        </div>
      </div>
    ),
    [controls, pills, items, note],
  );

  const frame = (reveal: number, body: ReactNode, noteProgress: number) => (
    <div>
      {controls(reveal)}
      <div className='mt-3'>{body}</div>
      {noteAt(noteProgress)}
    </div>
  );

  const content = () => {
    if (!isMoving) {
      if (settled === 0) return frame(0, livePills, 0);
      return frame(1, settled === 1 ? row : grid, 1);
    }
    if (position <= 0) return frame(0, livePills, 0);
    if (position < rowAt) {
      const progress = position / rowAt;
      return frame(progress, grow(progress), progress);
    }
    if (position === rowAt) return frame(1, row, 1);
    if (position < gridAt)
      return frame(1, morph((position - rowAt) / (gridAt - rowAt)), 1);
    return frame(1, grid, 1);
  };

  const refreshTravel = isPulling ? position - gridAt : 0;
  const progress = Math.min(
    1,
    Math.max(0, refreshTravel / (refreshAt - gridAt)),
  );
  const isCircleShown = isRefreshing || refreshTravel > 0;
  const circleY = isRefreshing
    ? CIRCLE_REST_PX
    : mix(-CIRCLE_PX, CIRCLE_REST_PX, progress);

  return (
    <div className='relative'>
      <div
        ref={clipRef}
        className='overflow-hidden'
      >
        {content()}
      </div>
      <div
        className='pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden'
        style={{ height: CIRCLE_REST_PX + CIRCLE_PX + 16 }}
        role='status'
      >
        <div
          className={join(
            'flex items-center justify-center rounded-full border shadow-md',
            progress >= 1 && !isRefreshing
              ? 'bg-primary border-primary'
              : 'bg-card border-border',
            !isPulling && 'transition-transform duration-200',
          )}
          style={{
            width: CIRCLE_PX,
            height: CIRCLE_PX,
            transform: `translateY(${isCircleShown ? circleY : -CIRCLE_PX - 8}px)`,
          }}
        >
          <RefreshRing
            progress={progress}
            isSpinning={isRefreshing}
            isReady={progress >= 1 && !isRefreshing}
          />
        </div>
        {isCircleShown && (
          <span className='sr-only'>
            {isRefreshing
              ? WORDS.refreshing
              : progress >= 1
                ? WORDS.releaseHint
                : WORDS.pullHint}
          </span>
        )}
      </div>
      {measuring}
    </div>
  );
}

interface PlanOverviewProps {
  sections: readonly ViewSection[];
  current: PlanSection;
  onSelect: (section: PlanSection) => void;
}

/** The top of the Plan tab: the thin row of views, which a pull down grows into a row of tiles, then a grid of them, then a refresh. */
function PlanOverview({ sections, current, onSelect }: PlanOverviewProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const [mode, setMode] = useState<OverviewMode>('monthly');
  const [settled, setSettled] = useState<Level>(0);
  const [motion, setMotion] = useState<Motion | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const positionRef = useRef(0);
  const restart = useRestartApp(() => setIsRefreshing(true));
  const { figures, priority } = usePlanOverview(today, mode);

  useEffect(() => {
    if (!isRefreshing) return;
    const timer = window.setTimeout(
      () => setIsRefreshing(false),
      REFRESH_RESET_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isRefreshing]);

  const settle = useCallback((level: Level, from: number | null) => {
    setSettled(level);
    setMotion((previous) =>
      from === null || isMotionReduced()
        ? null
        : { from, key: (previous?.key ?? 0) + 1 },
    );
  }, []);
  const goTo = (level: Level) => settle(level, positionRef.current);
  const endMotion = useCallback(() => setMotion(null), []);

  const items = sections.map((section) => ({
    key: section,
    emoji: PLAN_VIEW_EMOJI[section],
    name: PLAN_SECTION_LABELS[section],
    figure: <Figure segments={figures[section]} />,
    isCurrent: current === section,
    node: (
      <OverviewTile
        name={PLAN_SECTION_LABELS[section]}
        emoji={PLAN_VIEW_EMOJI[section]}
        segments={figures[section]}
        isCurrent={current === section}
        onOpen={() => {
          goTo(0);
          onSelect(section);
        }}
      />
    ),
  }));

  const pills = (
    <div data-no-swipe>
      <PillRow label='Plan sections' isThin isScrolling scrollKey={current}>
        {sections.map((section) => (
          <Pill
            key={section}
            emoji={PLAN_VIEW_EMOJI[section]}
            isThin
            isSelected={current === section}
            className='max-[359px]:px-1! max-sm:px-2 max-sm:[&_[data-pill-emoji]]:hidden'
            onClick={() => onSelect(section)}
          >
            {PLAN_SECTION_LABELS[section]}
          </Pill>
        ))}
      </PillRow>
    </div>
  );

  const isGrid = settled === 2;
  const controls = (reveal: number) => (
    <div className={join(BUTTON_ROW_CLASS, 'justify-between')}>
      <div
        className={join(
          reveal < 1 && 'pointer-events-none',
          reveal === 0 && 'invisible',
        )}
        style={{ opacity: reveal }}
        aria-hidden={reveal < 1 ? true : undefined}
      >
        <SegmentedControl
          isCompact
          label={WORDS.modeLabel}
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />
      </div>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        onClick={() => goTo(isGrid ? 1 : 2)}
      >
        {isGrid ? WORDS.viewLess : WORDS.viewAll}
        {isGrid ? (
          <ChevronUp className='h-4 w-4' aria-hidden='true' />
        ) : (
          <ChevronDown className='h-4 w-4' aria-hidden='true' />
        )}
      </Button>
    </div>
  );

  const note = priority ? (
    <p className='text-muted-foreground text-sm text-balance'>
      {WORDS.priorityTotal(priority.counted)}
      <Figure segments={[priority.total]} isWhole />
      {WORDS.priorityRest}
    </p>
  ) : null;

  return (
    <PullFrame
      controls={controls}
      pills={pills}
      items={items}
      note={note}
      settled={settled}
      motion={motion}
      isRefreshing={isRefreshing}
      positionRef={positionRef}
      onSettle={settle}
      onMotionEnd={endMotion}
      onRefresh={restart}
    />
  );
}

export default PlanOverview;
