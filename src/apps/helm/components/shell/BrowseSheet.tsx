import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Search } from 'lucide-react';

import Drawer from '@/components/Drawer';
import { useAppSelector } from '@/store';
import {
  selectHeldItems,
  selectNewSinceLooked,
} from '@apps/helm/store/selectors/captureSelectors';
import { BROWSE_FOOT, BROWSE_TILES } from '@apps/helm/screen/views';
import { selectHasKeyDates } from '@apps/helm/store/selectors/keyDateSelectors';
import { selectHasProjects } from '@apps/helm/store/selectors/projectSelectors';
import { HELM_COPY } from '@apps/helm/constants';
import type { HelmView } from '@apps/helm/types';

import BrowseTile from '@apps/helm/components/shell/BrowseTile';

interface BrowseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenView: (view: HelmView) => void;
}

/** Every view as a bento of tiles by importance: the lead is wide, and a last small tile that would sit alone fills its row, so the grid has no holes. */
function BrowseSheet({ isOpen, onClose, onOpenView }: BrowseSheetProps) {
  const unseenCount = useAppSelector(selectNewSinceLooked).length;
  const needsYouCount = useAppSelector(selectHeldItems).needsYou.length;
  const hasKeyDates = useAppSelector(selectHasKeyDates);
  const hasProjects = useAppSelector(selectHasProjects);
  const tiles = BROWSE_TILES.filter(
    (tile) =>
      (tile.view !== 'comingUp' || hasKeyDates) &&
      (tile.view !== 'projects' || hasProjects),
  );
  const singles = tiles.filter((tile) => tile.importance !== 'lead');
  const lastSingleView = singles.length % 2 === 1 ? singles.at(-1)?.view : null;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title='Browse' showCloseButton>
      <div className='space-y-4 pb-4'>
        <Button
          type='button'
          variant='tertiary'
          onClick={() => onOpenView('search')}
          className='border-border text-foreground! h-12 w-full min-w-0 justify-between! gap-2 rounded-xl border px-3! text-[15px] font-normal'
        >
          <span className='text-muted-foreground flex min-w-0 items-center gap-2'>
            <Search className='size-4 shrink-0' aria-hidden='true' />
            <span className='text-foreground truncate'>
              {HELM_COPY.searchEverything}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <div className='grid [grid-auto-flow:dense] grid-cols-2 gap-3'>
          {tiles.map((tile) => (
            <BrowseTile
              key={tile.view}
              view={tile.view}
              importance={tile.importance}
              grows={tile.grows}
              openQuestions={needsYouCount}
              newSinceLooked={unseenCount}
              isWide={
                tile.importance === 'lead' || tile.view === lastSingleView
              }
              onOpen={onOpenView}
            />
          ))}
        </div>
        {BROWSE_FOOT.length > 0 && (
          <div className='border-border flex flex-wrap gap-2 border-t pt-3'>
            {BROWSE_FOOT.map((view) => (
              <BrowseTile
                key={view}
                view={view}
                importance='minor'
                grows={null}
                openQuestions={0}
                newSinceLooked={0}
                isWide={false}
                onOpen={onOpenView}
              />
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default BrowseSheet;
