import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Search } from 'lucide-react';

import { getModifierKeyLabel } from '@/hooks/useKeyboardShortcuts';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { VIEW_ENTRIES } from '@apps/helm/components/shell/viewEntries';
import { useBrowseTiles } from '@apps/helm/components/shell/useBrowseTiles';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { BROWSE_FOOT, VIEW_PARENTS } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

const ROW =
  'h-10 w-full min-w-0 justify-start! gap-3 rounded-lg px-3! text-left text-[15px] font-normal';

/** The destination a view belongs to: itself, else the nearest parent that is listed. */
const toDestination = (
  current: HelmView | undefined,
  listed: readonly HelmView[],
): HelmView | null =>
  current === undefined
    ? null
    : listed.includes(current)
      ? current
      : toDestination(VIEW_PARENTS[current], listed);

/** The desktop's left rail, from `lg`: the assistant's name, Search everything, every Browse destination and, at its foot, Connected apps, Settings and Activity. The current destination is marked. */
function DesktopSidebar() {
  const name = useAssistantName();
  const { view, showView } = useHelmUrlState();
  const { tiles, needsYouCount, todayLine } = useBrowseTiles();
  const listed = [...tiles.map((tile) => tile.view), ...BROWSE_FOOT];
  const current = toDestination(view, listed);

  const renderRow = (target: HelmView) => {
    const { label: entryLabel, icon: Icon } = VIEW_ENTRIES[target];
    const label =
      typeof entryLabel === 'function' ? entryLabel(name) : entryLabel;
    const line = target === 'today' ? todayLine : null;
    const isCurrent = current === target;
    return (
      <li key={target}>
        <Button
          type='button'
          variant='tertiary'
          aria-current={isCurrent ? 'page' : undefined}
          className={join(ROW, isCurrent && 'bg-muted font-medium')}
          onClick={() => void showView(target)}
        >
          <Icon
            className='text-muted-foreground size-[18px] shrink-0'
            aria-hidden='true'
          />
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='truncate'>{label}</span>
            {line && (
              <span className='text-muted-foreground truncate text-xs font-normal'>
                {line}
              </span>
            )}
          </span>
          {target === 'inbox' && needsYouCount > 0 && (
            <span
              className='bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 text-xs tabular-nums'
              aria-label={HELM_COPY.needsYouCount(needsYouCount)}
            >
              {needsYouCount}
            </span>
          )}
        </Button>
      </li>
    );
  };

  return (
    <aside
      aria-label={HELM_COPY.sidebarLabel}
      className='border-border bg-background fixed top-[calc(4rem+var(--site-banner-inset,0px))] bottom-0 left-0 z-10 flex w-65 flex-col gap-4 overflow-y-auto border-r px-3 pt-4 pb-4'
    >
      <Button
        type='button'
        variant='tertiary'
        className='h-11 min-w-0 justify-start! gap-2 px-2!'
        onClick={() => void showView('home')}
      >
        <AssistantMark name={name} isLarge />
        <span
          className={join(
            'helm-serif truncate text-[22px] leading-7',
            view === 'home' && 'underline decoration-1 underline-offset-4',
          )}
        >
          {name}
        </span>
      </Button>
      <Button
        type='button'
        variant='tertiary'
        aria-current={view === 'search' ? 'page' : undefined}
        className={join(
          'border-border text-foreground! h-11 w-full min-w-0 justify-between! gap-2 rounded-xl border px-3! text-[15px] font-normal',
          view === 'search' && 'bg-muted',
        )}
        onClick={() => void showView('search')}
      >
        <span className='flex min-w-0 items-center gap-2'>
          <Search
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
          <span className='truncate'>{HELM_COPY.searchEverything}</span>
        </span>
        <kbd className='text-muted-foreground border-border shrink-0 rounded-md border px-1.5 font-sans text-xs'>
          {HELM_COPY.searchShortcutLabel(getModifierKeyLabel())}
        </kbd>
      </Button>
      <nav aria-label={HELM_COPY.sidebarNavLabel} className='flex-1'>
        <ul className='space-y-0.5'>
          {tiles.map((tile) => renderRow(tile.view))}
        </ul>
      </nav>
      <ul className='border-border space-y-0.5 border-t pt-3'>
        {BROWSE_FOOT.map(renderRow)}
      </ul>
    </aside>
  );
}

export default DesktopSidebar;
