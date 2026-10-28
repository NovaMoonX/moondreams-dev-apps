import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface EnvelopeTileProps {
  name: string;
  emoji: string | null;
  cents: number;
  onOpen: () => void;
}

/** An envelope on Home: its name and its figure, which the level calls assigned, left or over. It opens that envelope. */
function EnvelopeTile({ name, emoji, cents, onOpen }: EnvelopeTileProps) {
  const { value, word } = describeEnvelopeFigure(
    useAppSelector(selectLevel),
    cents,
  );
  return (
    <li className='first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'>
      <Button
        variant='tertiary'
        className='h-auto w-full items-start justify-start gap-3 rounded-none p-3 text-left font-normal whitespace-normal'
        aria-label={`${name}, ${value} ${word}. Open this envelope`}
        onClick={onOpen}
      >
        <ItemBadge name={name} emoji={emoji} />
        <span className='line-clamp-2 min-w-0 flex-1 pt-2 font-medium break-words'>
          {name}
        </span>
        <span className='block shrink-0 text-right'>
          <span className='block pt-0.5 font-semibold whitespace-nowrap tabular-nums'>
            {value}
          </span>
          <span className='text-muted-foreground block text-xs'>{word}</span>
        </span>
        <ChevronRight
          className='text-muted-foreground mt-2.5 h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

export default EnvelopeTile;
