import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
const LEVELS: Level[] = [0, 1, 2];

/** Extra travel after the grid is fully shown before the refresh ring starts, so the last step is felt. */
const STEP_GAP_PX = 16;
const REFRESH_EXTRA_MIN_PX = 72;
const INDICATOR_PX = 56;
const FALLBACK_HEIGHTS: Record<Level, number> = { 0: 72, 1: 170, 2: 330 };
const REFRESH_RESET_MS = 1500;
const RING_RADIUS = 11;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

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
        'bg-card border-border text-foreground! hover:bg-muted flex min-h-[4.5rem] min-w-0 flex-col items-start justify-start gap-1 border px-3 py-2 text-left font-normal whitespace-normal',
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
}: {
  progress: number;
  isSpinning: boolean;
}) {
  return (
    <svg
      viewBox='0 0 28 28'
      className={join(
        'size-7 -rotate-90 transition-transform duration-150',
        isSpinning && 'animate-spin',
        progress >= 1 && !isSpinning && 'scale-125',
      )}
      aria-hidden='true'
    >
      <circle
        cx='14'
        cy='14'
        r={RING_RADIUS}
        fill='none'
        strokeWidth='3'
        className='stroke-muted'
      />
      <circle
        cx='14'
        cy='14'
        r={RING_RADIUS}
        fill='none'
        strokeWidth='3'
        strokeLinecap='round'
        className='stroke-primary'
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - (isSpinning ? 0.75 : progress))}
      />
    </svg>
  );
}

interface PullFrameProps {
  /** The content of each step; built by the parent so a pull re-renders only this frame, never the figures inside them. */
  levels: Record<Level, ReactNode>;
  settled: Level;
  isInstant: boolean;
  isRefreshing: boolean;
  onSettle: (level: Level, isInstant?: boolean) => void;
  onRefresh: () => void;
}

/** The height wrapper and refresh ring: owns the pull, measures every step's height up front and clips the open step to the finger. */
function PullFrame({
  levels,
  settled,
  isInstant,
  isRefreshing,
  onSettle,
  onRefresh,
}: PullFrameProps) {
  const [heights, setHeights] = useState<Partial<Record<Level, number>>>({});
  const clipRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<Partial<Record<Level, HTMLDivElement | null>>>({});
  const pendingShiftRef = useRef(0);

  const heightOf = (level: Level) => heights[level] ?? FALLBACK_HEIGHTS[level];
  const pillsHeight = heightOf(0);
  const rest: Record<Level, number> = {
    0: 0,
    1: heightOf(1) - pillsHeight,
    2: heightOf(2) - pillsHeight,
  };
  // The finger's position on one line: 0 is the pills, `rest[1]` the tiles, `gridDoneAt` the whole grid. The grid shows from
  // the midpoint between the tiles and the grid, the same point a release settles on it, and from there the open height
  // climbs from the tiles' height to the grid's, so neither the height nor the step shown jumps.
  const gridDoneAt = rest[2] + STEP_GAP_PX;
  const gridFrom = (rest[1] + rest[2]) / 2;
  const positions: Record<Level, number> = { 0: 0, 1: rest[1], 2: gridDoneAt };
  const refreshVirtual = Math.max(
    gridDoneAt + REFRESH_EXTRA_MIN_PX,
    window.innerHeight / 2,
  );
  const getOpenHeight = (position: number) =>
    position < gridFrom
      ? Math.min(position, rest[1])
      : Math.min(
          rest[2],
          rest[1] +
            ((position - gridFrom) * (rest[2] - rest[1])) /
              (gridDoneAt - gridFrom),
        );
  const getLevelAt = (position: number): Level => {
    if (position >= gridFrom) return 2;
    return position >= rest[1] / 2 ? 1 : 0;
  };

  const { distance, isPulling } = usePullDown({
    isEnabled: true,
    canPullUp: settled > 0,
    refreshAt: refreshVirtual - positions[settled],
    onRefresh,
    onRelease: (travelled) =>
      onSettle(getLevelAt(Math.max(0, positions[settled] + travelled))),
  });

  const virtual = Math.max(0, positions[settled] + distance);
  // The tiles' step shows from the first pixel; a release below the halfway point folds back to the pills.
  const level: Level = isPulling
    ? virtual > 0
      ? (Math.max(1, getLevelAt(virtual)) as Level)
      : 0
    : settled;
  const refreshTravel = virtual - gridDoneAt;
  const progress = isPulling
    ? Math.min(1, Math.max(0, refreshTravel / (refreshVirtual - gridDoneAt)))
    : 0;
  const indicatorHeight = isRefreshing
    ? INDICATOR_PX
    : isPulling
      ? Math.min(INDICATOR_PX, Math.max(0, refreshTravel))
      : 0;

  useLayoutEffect(() => {
    if (pendingShiftRef.current > 0) {
      window.scrollBy(0, -pendingShiftRef.current);
      pendingShiftRef.current = 0;
    }
  });

  useEffect(() => {
    const measure = () =>
      setHeights((previous) => {
        const next = Object.fromEntries(
          LEVELS.map((step) => [
            step,
            measureRefs.current[step]?.offsetHeight ?? previous[step],
          ]),
        );
        return LEVELS.every((step) => next[step] === previous[step])
          ? previous
          : next;
      });
    const observer = new ResizeObserver(measure);
    LEVELS.forEach((step) => {
      const node = measureRefs.current[step];
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
        clip.offsetHeight - (heights[0] ?? 0),
      );
      onSettle(0, true);
    };
    window.addEventListener('scroll', fold, { passive: true });
    return () => window.removeEventListener('scroll', fold);
  }, [settled, heights, onSettle]);

  return (
    <div className='relative'>
      <div
        ref={clipRef}
        className={join(
          'overflow-hidden',
          !isPulling && !isInstant && 'transition-[max-height] duration-200',
        )}
        style={{
          maxHeight: isPulling
            ? pillsHeight + getOpenHeight(virtual)
            : heights[settled],
        }}
      >
        {levels[level]}
      </div>
      <div
        className={join(
          'flex items-center justify-center overflow-hidden',
          !isPulling && 'transition-[height] duration-200',
        )}
        style={{ height: indicatorHeight }}
        role='status'
      >
        {indicatorHeight > 0 && (
          <>
            <RefreshRing progress={progress} isSpinning={isRefreshing} />
            <span className='sr-only'>
              {isRefreshing
                ? WORDS.refreshing
                : progress >= 1
                  ? WORDS.releaseHint
                  : WORDS.pullHint}
            </span>
          </>
        )}
      </div>
      {LEVELS.map((step) => (
        <div
          key={step}
          ref={(node) => {
            measureRefs.current[step] = node;
          }}
          aria-hidden='true'
          inert
          className='pointer-events-none invisible absolute inset-x-0 top-0'
        >
          {levels[step]}
        </div>
      ))}
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
  const [isInstant, setIsInstant] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const settle = useCallback((level: Level, isFoldedByScroll = false) => {
    setIsInstant(isFoldedByScroll);
    setSettled(level);
  }, []);

  const tiles = (layout: 'row' | 'grid') => {
    const items = sections.map((section) => (
      <OverviewTile
        key={section}
        name={PLAN_SECTION_LABELS[section]}
        emoji={PLAN_VIEW_EMOJI[section]}
        segments={figures[section]}
        isCurrent={current === section}
        className={
          layout === 'row'
            ? 'w-[calc(50%-0.25rem)] shrink-0 snap-start lg:w-[calc((100%-1rem)/3)]'
            : undefined
        }
        onOpen={() => {
          settle(0);
          onSelect(section);
        }}
      />
    ));
    return layout === 'row' ? (
      <div
        data-no-swipe
        className='flex touch-pan-y [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain pb-1'
        aria-label={WORDS.tilesLabel}
        role='group'
      >
        {items}
      </div>
    ) : (
      <div
        className='grid auto-rows-fr grid-cols-2 gap-2 lg:grid-cols-3 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2'
        role='group'
        aria-label={WORDS.tilesLabel}
      >
        {items}
      </div>
    );
  };

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

  const opened = (layout: 'row' | 'grid') => (
    <div className='space-y-3'>
      {pills}
      <div className='flex items-center justify-between gap-2'>
        <SegmentedControl
          isCompact
          label={WORDS.modeLabel}
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => settle(0)}
        >
          {WORDS.viewLess}
          <ChevronUp className='h-4 w-4' aria-hidden='true' />
        </Button>
      </div>
      {priority && (
        <p className='text-muted-foreground text-sm text-balance'>
          {WORDS.priorityTotal(priority.counted)}
          <Figure segments={[priority.total]} isWhole />
          {WORDS.priorityRest}
        </p>
      )}
      {tiles(layout)}
    </div>
  );

  const levels: Record<Level, ReactNode> = {
    0: (
      <div className='space-y-3'>
        {pills}
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            onClick={() => settle(2)}
          >
            {WORDS.viewAll}
            <ChevronDown className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      </div>
    ),
    1: opened('row'),
    2: opened('grid'),
  };

  return (
    <PullFrame
      levels={levels}
      settled={settled}
      isInstant={isInstant}
      isRefreshing={isRefreshing}
      onSettle={settle}
      onRefresh={restart}
    />
  );
}

export default PlanOverview;
