import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import Pill from '@/components/Pill';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';

const SEARCH_THRESHOLD = 12;
/** Two rows of pills: keep in step with `max-h-22` below. */
const COLLAPSED_ROWS_REM = 5.5;
/** Up to this many pills may sit below the two rows without a "Show all": a toggle that hides one to three options costs more than it saves. */
const MAX_QUIET_HIDDEN = 3;

export interface PillOption<T extends string> {
  value: T;
  label: string;
  /** A count or note after the label ("10 servings"); below 360px it moves to a second line inside the pill, so the row stays on one line with every word kept. */
  detail?: string;
  emoji?: string;
  /** A small image or icon in place of an emoji (a store's logo). */
  icon?: ReactNode;
}

interface Fit {
  key: string;
  width: number;
  /** How many options sit inside the two rows when the list is in its own order. */
  visible: number;
  overflows: boolean;
}

interface Trim {
  key: string;
  count: number;
}

const moveTo = <T,>(list: readonly T[], from: number, to: number) => {
  const rest = list.filter((_, index) => index !== from);
  const result = [...rest.slice(0, to), list[from], ...rest.slice(to)];
  return result;
};

const SCROLL_PEEK_PX = 8;

/** A row of wrapping pills — the container every pick-one or pick-several option row shares. A scrolling row stays one line at any width and keeps the chosen pill in view. */
export function PillRow({
  label,
  children,
  isThin = false,
  isScrolling = false,
  scrollKey,
}: {
  label: string;
  children: ReactNode;
  isThin?: boolean;
  isScrolling?: boolean;
  /** Changes when the chosen pill does, so a scrolling row brings it into view then and not on every render. */
  scrollKey?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const chosen = row?.querySelector('[aria-pressed="true"]');
    if (!isScrolling || !row || !chosen) {
      return;
    }
    const rowBox = row.getBoundingClientRect();
    const chosenBox = chosen.getBoundingClientRect();
    if (chosenBox.left < rowBox.left) {
      row.scrollLeft -= rowBox.left - chosenBox.left + SCROLL_PEEK_PX;
    } else if (chosenBox.right > rowBox.right) {
      row.scrollLeft += chosenBox.right - rowBox.right + SCROLL_PEEK_PX;
    }
  }, [isScrolling, scrollKey]);

  return (
    <div
      ref={rowRef}
      role='group'
      aria-label={label}
      className={join(
        'flex',
        isScrolling
          ? '-my-2 [scrollbar-width:none] gap-x-2 overflow-x-auto py-2 [&::-webkit-scrollbar]:hidden'
          : join('flex-wrap', isThin ? 'gap-x-2 gap-y-4' : 'gap-2'),
      )}
    >
      {children}
    </div>
  );
}

interface PillOptionsProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  isSelected: (value: T) => boolean;
  onToggle: (value: T) => void;
  /** A pill that always comes first and is never filtered out, like "New group". */
  leading?: ReactNode;
  selectedCount?: number;
  isThin?: boolean;
  /** One answer: picking collapses the list and clears its search; a chosen option that is hidden behind "Show all" takes the last visible slot, and one already visible keeps its place. */
  isSingle?: boolean;
  /** A short list keeps every option visible in its given order: no two-row collapse, no "Show all", no floating the chosen one. Past the search threshold it collapses like any other. */
  showAll?: boolean;
}

/** The pills of a pick-one or pick-several row that can grow: a search once there are many, and on a phone two rows until "Show all", but only when more than three pills would be hidden. */
export function PillOptions<T extends string>({
  label,
  options,
  isSelected,
  onToggle,
  leading,
  selectedCount = 0,
  isThin = false,
  isSingle = false,
  showAll: wantsAll = false,
}: PillOptionsProps<T>) {
  const showAll = wantsAll && options.length <= SEARCH_THRESHOLD;
  const isScrolling = isThin && options.some((option) => option.detail);
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [fit, setFit] = useState<Fit | null>(null);
  const [trim, setTrim] = useState<Trim | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<() => void>(() => undefined);
  const hasSearch = options.length > SEARCH_THRESHOLD;
  const trimmedQuery = hasSearch ? query.trim().toLowerCase() : '';
  const filtered =
    trimmedQuery === ''
      ? options
      : options.filter((option) =>
          option.label.toLowerCase().includes(trimmedQuery),
        );
  const optionsKey = options.map((option) => option.value).join('\u0000');
  const isFitCurrent = fit !== null && fit.key === optionsKey;
  const isHidingRows = isFitCurrent && fit.overflows;
  const isClamped =
    !showAll && trimmedQuery === '' && !isExpanded && isHidingRows;

  // A chosen option behind "Show all" takes the last visible slot (one slot earlier while it wraps past the second row); one already visible, or a fully open list, keeps its own order.
  const selectedIndex = isSingle
    ? filtered.findIndex((option) => isSelected(option.value))
    : -1;
  const trimKey = `${optionsKey}:${selectedIndex}:${fit?.width}`;
  const slot = Math.max(
    0,
    (isFitCurrent ? fit.visible : 0) -
      1 -
      (trim?.key === trimKey ? trim.count : 0),
  );
  const floats =
    isClamped && isSingle && selectedIndex >= (isFitCurrent ? fit.visible : 0);
  const visible = floats ? moveTo(filtered, selectedIndex, slot) : filtered;

  // Measured after every render, before paint. The natural order is what tells how many pills fit; a floated order is only checked for the chosen pill wrapping out of view.
  const measure = () => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const limit =
      COLLAPSED_ROWS_REM *
      parseFloat(getComputedStyle(document.documentElement).fontSize);
    const top = content.getBoundingClientRect().top;
    const pills = [...(content.firstElementChild?.children ?? [])];
    const isClipped = (pill: Element) =>
      pill.getBoundingClientRect().bottom - top > limit + 1;
    const width = Math.round(content.offsetWidth);
    const leadingCount = pills.length - visible.length;

    if (visible !== filtered) {
      if (fit && fit.width !== width) {
        setFit(null);
        return;
      }
      const chosen = pills[leadingCount + slot];
      if (chosen && slot > 0 && isClipped(chosen)) {
        setTrim({
          key: trimKey,
          count: (trim?.key === trimKey ? trim.count : 0) + 1,
        });
      }
      return;
    }

    const hiddenCount = pills.filter(isClipped).length;
    const next = {
      key: optionsKey,
      width,
      visible: pills.length - leadingCount - hiddenCount,
      overflows: hiddenCount > MAX_QUIET_HIDDEN,
    };
    setFit((current) =>
      current &&
      current.key === next.key &&
      current.width === next.width &&
      current.visible === next.visible &&
      current.overflows === next.overflows
        ? current
        : next,
    );
  };
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  });
  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const showToggle =
    !showAll && trimmedQuery === '' && (isHidingRows || isExpanded);

  return (
    <div className='space-y-2'>
      {hasSearch && (
        <div
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={`Search ${label.toLowerCase()}`}
          />
        </div>
      )}
      <div
        className={join(isClamped && 'max-h-22 overflow-hidden')}
        onFocusCapture={(event) =>
          isClamped &&
          event.target.matches(':focus-visible') &&
          setIsExpanded(true)
        }
      >
        <div ref={contentRef}>
          <PillRow
            label={label}
            isThin={isThin}
            isScrolling={isScrolling}
            scrollKey={
              visible.find((option) => isSelected(option.value))?.value
            }
          >
            {leading}
            {visible.map((option) => (
              <Pill
                key={option.value}
                emoji={option.emoji}
                icon={option.icon}
                isThin={isThin}
                isSelected={isSelected(option.value)}
                className={join(
                  option.detail &&
                    !isScrolling &&
                    'max-[359px]:h-auto! max-[359px]:min-h-8! max-[359px]:py-0.5!',
                )}
                onClick={() => {
                  onToggle(option.value);
                  if (isSingle) {
                    setIsExpanded(false);
                    setQuery('');
                  }
                }}
              >
                {option.detail ? (
                  <span
                    className={join(
                      'flex min-w-0 items-center gap-x-1',
                      !isScrolling &&
                        'max-[359px]:flex-col max-[359px]:items-start max-[359px]:gap-y-0 max-[359px]:leading-tight',
                    )}
                  >
                    <span className='truncate'>{option.label}</span>
                    <span
                      aria-hidden='true'
                      className={join(!isScrolling && 'max-[359px]:hidden')}
                    >
                      ·
                    </span>
                    <span
                      className={join(
                        'truncate',
                        !isScrolling &&
                          'max-[359px]:text-[11px] max-[359px]:opacity-80',
                      )}
                    >
                      {option.detail}
                    </span>
                  </span>
                ) : (
                  option.label
                )}
              </Pill>
            ))}
          </PillRow>
        </div>
      </div>
      {trimmedQuery !== '' && visible.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          Nothing matches &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
      {showToggle && (
        <div className='flex items-center justify-between gap-3'>
          <ShowMoreButton
            isOpen={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? 'Show fewer' : `Show all ${options.length}`}
          </ShowMoreButton>
          {selectedCount > 0 && (
            <span className='text-muted-foreground text-xs whitespace-nowrap'>
              {selectedCount} selected
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface PillGroupProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  leading?: ReactNode;
  isThin?: boolean;
}

/** Pick exactly one of a few options. */
export function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  leading,
  isThin,
}: PillGroupProps<T>) {
  return (
    <PillOptions
      label={label}
      options={options}
      leading={leading}
      isThin={isThin}
      isSingle
      isSelected={(optionValue) => value === optionValue}
      onToggle={onChange}
    />
  );
}

interface MultiPillGroupProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
}

/** Pick any number of a few options. */
export function MultiPillGroup<T extends string>({
  label,
  options,
  values,
  onChange,
}: MultiPillGroupProps<T>) {
  return (
    <PillOptions
      label={label}
      options={options}
      selectedCount={values.length}
      isSelected={(optionValue) => values.includes(optionValue)}
      onToggle={(optionValue) =>
        onChange(
          values.includes(optionValue)
            ? values.filter((value) => value !== optionValue)
            : [...values, optionValue],
        )
      }
    />
  );
}
