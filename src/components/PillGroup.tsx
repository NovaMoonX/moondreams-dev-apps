import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Pill from '@/components/Pill';
import SearchInput from '@/components/SearchInput';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
}

/** The pills of a pick-one or pick-several row that can grow: a search once there are many, and on a phone two rows until "Show all". */
export function PillOptions<T extends string>({
  label,
  options,
  isSelected,
  onToggle,
  leading,
  selectedCount = 0,
}: PillOptionsProps<T>) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasSearch = options.length > SEARCH_THRESHOLD;
  const trimmedQuery = hasSearch ? query.trim().toLowerCase() : '';
  const visible =
    trimmedQuery === '' ? options : options.filter((option) => option.label.toLowerCase().includes(trimmedQuery));
  const isClamped = isPhone && trimmedQuery === '' && !isExpanded;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const limit = COLLAPSED_ROWS_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const observer = new ResizeObserver(() => setIsOverflowing(content.offsetHeight > limit + 2));
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const showToggle = isPhone && trimmedQuery === '' && (isOverflowing || isExpanded);

  return (
    <div className='space-y-2'>
      {hasSearch && (
        <div onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}>
          <SearchInput value={query} onChange={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
        </div>
      )}
      <div className={join(isClamped && 'max-h-22 overflow-hidden')} onFocusCapture={() => isClamped && isOverflowing && setIsExpanded(true)}>
        <div ref={contentRef}>
          <PillRow label={label}>
            {leading}
            {visible.map((option) => (
              <Pill
                key={option.value}
                emoji={option.emoji}
                isSelected={isSelected(option.value)}
                onClick={() => onToggle(option.value)}
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
}

/** Pick exactly one of a few options. */
export function PillGroup<T extends string>({ label, options, value, onChange, leading }: PillGroupProps<T>) {
  return (
    <PillOptions
      label={label}
      options={options}
      leading={leading}
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
