import { useState, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { SlidersHorizontal, X } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface ActiveFilter {
  key: string;
  label: string;
}

interface FilterSectionProps {
  title: string;
  children: ReactNode;
}

/** One question inside a filter panel: a small uppercase title over its pills. */
export function FilterSection({ title, children }: FilterSectionProps) {
  return (
    <section aria-label={title} className='space-y-2'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {title}
      </h3>
      {children}
    </section>
  );
}

interface FilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  /** Names the filter button and the sheet it opens ("Filter ingredients"). */
  filterLabel: string;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearFilters: () => void;
  /** Sits first in the chips row, so a view switch (Yours / All) and the filters share one line. */
  leading?: ReactNode;
  /** Another icon button beside the filter button, such as a `SortControl`. */
  trailing?: ReactNode;
  /** The primary button that closes the sheet on a phone ("Show 12 ingredients"). */
  doneLabel?: string;
  /** A shorter button label for the narrowest phones, where the full one would be cut off ("Show 150"). */
  compactDoneLabel?: string;
  /** The filter controls: a `FilterSection` per question. */
  children: ReactNode;
}

/**
 * A search field with a filter icon beside it: filters open in a drawer on phones and a popover from `sm` up,
 * and the ones that are on show as small dismissible chips under the field with one Clear, so turning a filter
 * on never adds a row of controls above the list.
 */
function FilterBar({
  query,
  onQueryChange,
  searchPlaceholder,
  filterLabel,
  activeFilters,
  onRemoveFilter,
  onClearFilters,
  leading,
  trailing,
  doneLabel = 'Done',
  compactDoneLabel,
  children,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const activeCount = activeFilters.length;
  const hasActive = activeCount > 0;

  const trigger = (
    <span className='relative inline-flex shrink-0'>
      <Button
        type='button'
        variant='secondary'
        rounded='full'
        aria-label={
          hasActive ? `${filterLabel}, ${activeCount} on` : filterLabel
        }
        aria-expanded={isOpen}
        className={join('h-12 w-12 shrink-0 p-0', hasActive && 'bg-accent!')}
        onClick={() => setIsOpen((open) => !open)}
      >
        <SlidersHorizontal className='h-5 w-5' aria-hidden='true' />
      </Button>
      {hasActive && (
        <span
          aria-hidden='true'
          className='bg-primary text-primary-foreground pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold'
        >
          {activeCount}
        </span>
      )}
    </span>
  );

  const footer = (
    <div className='flex items-center gap-2'>
      {hasActive && (
        <Button
          type='button'
          variant='secondary'
          className='h-11'
          onClick={onClearFilters}
        >
          Clear
        </Button>
      )}
      <Button
        type='button'
        className='h-11 min-w-0 flex-1'
        onClick={() => setIsOpen(false)}
      >
        {compactDoneLabel ? (
          <>
            <span className='truncate max-[360px]:hidden'>{doneLabel}</span>
            <span className='truncate min-[361px]:hidden'>
              {compactDoneLabel}
            </span>
          </>
        ) : (
          <span className='truncate'>{doneLabel}</span>
        )}
      </Button>
    </div>
  );

  const panel = isPhone ? (
    <Drawer
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={filterLabel}
      showCloseButton
      footer={<div className='px-4 pb-4'>{footer}</div>}
    >
      <div className='space-y-5 pb-4'>{children}</div>
    </Drawer>
  ) : null;

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1'>
          <SearchInput
            value={query}
            onChange={onQueryChange}
            placeholder={searchPlaceholder}
          />
        </div>
        {isPhone ? (
          trigger
        ) : (
          <Popover
            trigger={trigger}
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            placement='bottom'
            alignment='end'
            className='w-80 p-4'
          >
            {isOpen && (
              <div className='flex max-h-[min(32rem,75dvh)] flex-col gap-3'>
                <div className='min-h-0 flex-1 space-y-5 overflow-y-auto'>
                  {children}
                </div>
                <div className='border-border shrink-0 border-t pt-3'>
                  {footer}
                </div>
              </div>
            )}
          </Popover>
        )}
        {trailing}
      </div>
      {panel}
      {(leading || hasActive) && (
        <div className='flex flex-wrap items-center gap-x-2 gap-y-3'>
          {leading}
          {activeFilters.map((filter) => (
            <Button
              key={filter.key}
              type='button'
              variant='tertiary'
              size='sm'
              rounded='full'
              aria-label={`Remove filter: ${filter.label}`}
              className="bg-accent text-accent-foreground! relative h-6! min-h-0! max-w-full gap-1 px-2.5 py-0! text-xs font-normal before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
              onClick={() => onRemoveFilter(filter.key)}
            >
              <span className='truncate'>{filter.label}</span>
              <X className='h-3 w-3 shrink-0' aria-hidden='true' />
            </Button>
          ))}
          {hasActive && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className="relative h-6! min-h-0! px-1! py-0! text-xs before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
              onClick={onClearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterBar;
