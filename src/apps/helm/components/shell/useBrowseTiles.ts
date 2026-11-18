import { useAppSelector } from '@/store';
import { BROWSE_TILES } from '@apps/helm/screen/views';
import {
  selectHeldItems,
  selectNewSinceLooked,
} from '@apps/helm/store/selectors/captureSelectors';
import { selectHasHabits } from '@apps/helm/store/selectors/habitSelectors';
import { selectHasKeyDates } from '@apps/helm/store/selectors/keyDateSelectors';
import { selectHasProjects } from '@apps/helm/store/selectors/projectSelectors';
import { useTodayTileLine } from '@apps/helm/components/shell/useTodayTileLine';

/** The Browse destinations the person has something in, with the figures their tiles carry; the sheet and the desktop sidebar both draw from it. */
export function useBrowseTiles() {
  const unseenCount = useAppSelector(selectNewSinceLooked).length;
  const needsYouCount = useAppSelector(selectHeldItems).needsYou.length;
  const hasKeyDates = useAppSelector(selectHasKeyDates);
  const hasProjects = useAppSelector(selectHasProjects);
  const hasHabits = useAppSelector(selectHasHabits);
  const todayLine = useTodayTileLine();
  const tiles = BROWSE_TILES.filter(
    (tile) =>
      (tile.view !== 'comingUp' || hasKeyDates) &&
      (tile.view !== 'projects' || hasProjects) &&
      (tile.view !== 'habits' || hasHabits),
  );
  return { tiles, unseenCount, needsYouCount, todayLine };
}
