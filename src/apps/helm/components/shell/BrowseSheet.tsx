import Drawer from '@/components/Drawer';
import { useAppSelector } from '@/store';
import { selectUnseenCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { BROWSE_FOOT, BROWSE_TILES } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

import BrowseTile from '@apps/helm/components/shell/BrowseTile';

interface BrowseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenView: (view: HelmView) => void;
}

/** Questions arrive with the issue that asks them; until then a tile that grows with them stays small. */
const OPEN_QUESTIONS = 0;

const SINGLE_TILES = BROWSE_TILES.filter((tile) => tile.importance !== 'lead');

/** Every view as a bento of tiles by importance: the lead is wide, and a last small tile that would sit alone fills its row, so the grid has no holes. */
function BrowseSheet({ isOpen, onClose, onOpenView }: BrowseSheetProps) {
  const unseenCount = useAppSelector(selectUnseenCaptures).length;
  const lastSingleView =
    SINGLE_TILES.length % 2 === 1 ? SINGLE_TILES.at(-1)?.view : null;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title='Browse' showCloseButton>
      <div className='space-y-4 pb-4'>
        <div className='grid [grid-auto-flow:dense] grid-cols-2 gap-3'>
          {BROWSE_TILES.map((tile) => (
            <BrowseTile
              key={tile.view}
              view={tile.view}
              importance={tile.importance}
              grows={tile.grows}
              openQuestions={OPEN_QUESTIONS}
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
