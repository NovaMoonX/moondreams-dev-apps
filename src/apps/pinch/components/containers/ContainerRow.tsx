import { memo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { formatDateShort } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import { CONTAINER_EMOJI, CONTAINER_PLACE_EMOJIS } from '@apps/pinch/constants';
import type { Container } from '@apps/pinch/types';
import {
  getEatByPhrase,
  getEatByState,
  getEndText,
  getStartServings,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface ContainerRowProps {
  container: Container;
  title: string;
  onOpen: (container: Container) => void;
}

function ContainerRow({ container, title, onOpen }: ContainerRowProps) {
  const isFinished = container.status === 'DONE';
  const started = getStartServings(container);

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(container)}
      className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      <span
        className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
        aria-hidden='true'
      >
        {isFinished ? CONTAINER_EMOJI : CONTAINER_PLACE_EMOJIS[container.place]}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block font-medium wrap-break-word'>
          {title}
        </span>
        <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal'>
          {isFinished ? (
            <>
              <span className='whitespace-nowrap'>
                {getEndText(container)} · {formatDateShort(container.updatedAt)}
              </span>
              {started !== null && (
                <span className='whitespace-nowrap'>
                  {formatServings(started)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className='whitespace-nowrap'>
                {formatServings(container.servings)}
              </span>
              <span className='whitespace-nowrap'>
                Eat by {getEatByPhrase(container.eatBy)}
              </span>
              <EatByBadge state={getEatByState(container.eatBy)} />
            </>
          )}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default memo(ContainerRow);
