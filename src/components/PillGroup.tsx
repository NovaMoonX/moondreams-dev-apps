import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Pill from '@/components/Pill';
import SearchInput from '@/components/SearchInput';

const SEARCH_THRESHOLD = 12;
/** Two rows of pills: keep in step with `max-h-22` below. */
const COLLAPSED_ROWS_REM = 5.5;

export interface PillOption<T extends string> {
  value: T;
  label: string;
  emoji?: string;
}

/** A row of wrapping pills — the container every pick-one or pick-several option row shares. */
export function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role='group' aria-label={label} className='flex flex-wrap gap-2'>
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
  /** One answer: picking collapses the list, clears its search and floats the chosen option to the front. */
  isSingle?: boolean;
}

/** The pills of a pick-one or pick-several row that can grow: a search once there are many, and on a phone two rows until "Show all". */
export function PillOptions<T extends string>({
  label,
  options,
  isSelected,
  onToggle,
  leading,
  selectedCount = 0,
  isThin = false,
  isSingle = false,
}: PillOptionsProps<T>) {
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHidingRows, setIsHidingRows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isFloatedRef = useRef(false);
  const overflowLayoutRef = useRef('');
  const hasSearch = options.length > SEARCH_THRESHOLD;
  const trimmedQuery = hasSearch ? query.trim().toLowerCase() : '';
  const filtered =
    trimmedQuery === '' ? options : options.filter((option) => option.label.toLowerCase().includes(trimmedQuery));
  const isClamped = trimmedQuery === '' && !isExpanded;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const limit = COLLAPSED_ROWS_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    // Floating the chosen pill to the front can make the row fit; that must not read as "no overflow", or the pill floats back and the row flickers.
    const observer = new ResizeObserver(() => {
      const layout = `${Math.round(content.offsetWidth)}:${content.firstElementChild?.childElementCount}`;
      const overflows = content.offsetHeight > limit + 2;
      setIsHidingRows(overflows);
      if (overflows) {
        overflowLayoutRef.current = layout;
      } else if (isFloatedRef.current && overflowLayoutRef.current === layout) {
        return;
      }
      setIsOverflowing(overflows);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Collapsed, a chosen option moves to the front so it is never hidden behind "Show all".
  const visible =
    isSingle && trimmedQuery === '' && !isExpanded && isOverflowing
      ? [...filtered.filter((option) => isSelected(option.value)), ...filtered.filter((option) => !isSelected(option.value))]
      : filtered;
  useLayoutEffect(() => {
    isFloatedRef.current = visible.some((option, index) => option !== filtered[index]);
  });
  const showToggle = trimmedQuery === '' && (isHidingRows || isExpanded);

  return (
    <div className='space-y-2'>
      {hasSearch && (
        <div onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}>
          <SearchInput value={query} onChange={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
        </div>
      )}
      <div className={join(isClamped && 'max-h-22 overflow-hidden')} onFocusCapture={(event) => isClamped && isHidingRows && event.target.matches(':focus-visible') && setIsExpanded(true)}>
        <div ref={contentRef}>
          <PillRow label={label}>
            {leading}
            {visible.map((option) => (
              <Pill
                key={option.value}
                emoji={option.emoji}
                isThin={isThin}
                isSelected={isSelected(option.value)}
                onClick={() => {
                  onToggle(option.value);
                  if (isSingle) {
                    setIsExpanded(false);
                    setQuery('');
                  }
                }}
              >
                {option.label}
              </Pill>
            ))}
          </PillRow>
        </div>
      </div>
      {trimmedQuery !== '' && visible.length === 0 && (
        <p className='text-muted-foreground text-sm'>Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
      )}
      {showToggle && (
        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-10 px-0!'
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? 'Show fewer' : `Show all ${options.length}`}
          </Button>
          {selectedCount > 0 && (
            <span className='text-muted-foreground text-xs whitespace-nowrap'>{selectedCount} selected</span>
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
export function PillGroup<T extends string>({ label, options, value, onChange, leading, isThin }: PillGroupProps<T>) {
  return (
    <PillOptions
      label={label}
      options={options}
      leading={leading}
      isThin={isThin}
      isSingle
      selectedCount={value === null ? 0 : 1}
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
export function MultiPillGroup<T extends string>({ label, options, values, onChange }: MultiPillGroupProps<T>) {
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
