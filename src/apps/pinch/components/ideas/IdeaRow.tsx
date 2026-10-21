import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import IdeaThumbnail from '@apps/pinch/components/ideas/IdeaThumbnail';
import { useIsIdeaWaiting } from '@apps/pinch/hooks/useIdeaSaving';
import type { Idea } from '@apps/pinch/types';
import { getIdeaDetail } from '@apps/pinch/utils/ideas';

interface IdeaRowProps {
  idea: Idea;
  onOpen: (id: string) => void;
}

function IdeaRow({ idea, onOpen }: IdeaRowProps) {
  const isWaiting = useIsIdeaWaiting(idea.id);
  const detail = isWaiting
    ? "Saves when you're back online"
    : getIdeaDetail(idea);

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(idea.id)}
      className='h-auto w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      <IdeaThumbnail idea={idea} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-3 font-medium wrap-break-word whitespace-normal'>
          {idea.title}
        </span>
        {detail && (
          <span className='text-muted-foreground block truncate text-xs font-normal'>
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default IdeaRow;
