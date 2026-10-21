import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import {
  getStockParts,
  getStockUnit,
  type PlaceStock,
} from '@apps/pinch/utils/containers';

interface StockLineProps {
  summary: PlaceStock | undefined;
  /** What the numbers count, for screen readers: a recipe's servings or a saved meal's plates. */
  kind?: 'recipe' | 'meal';
}

function StockLine({ summary, kind = 'recipe' }: StockLineProps) {
  if (!summary) {
    return null;
  }

  const parts = getStockParts(summary);
  if (parts.length === 0) {
    return null;
  }

  return (
    <span className='text-muted-foreground flex flex-col gap-y-0.5 text-xs font-normal sm:flex-row sm:flex-wrap sm:gap-x-3'>
      {parts.map((part) => (
        <span
          key={part.place}
          className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'
        >
          <span className='whitespace-nowrap'>
            <span aria-hidden='true'>{CONTAINER_PLACE_EMOJIS[part.place]}</span>{' '}
            {part.servings}
            <span className='sr-only'>
              {` ${getStockUnit(part.servings, kind)}`}
            </span>{' '}
            in the {CONTAINER_PLACE_LABELS[part.place].toLowerCase()}
          </span>
          {part.due && (
            <EatByBadge state={part.due.state} label={part.due.label} />
          )}
        </span>
      ))}
    </span>
  );
}

export default StockLine;
