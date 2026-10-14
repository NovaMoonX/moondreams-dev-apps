import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, ExternalLink } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import FallbackImage from '@/components/FallbackImage';
import { useAppSelector } from '@/store';
import { useIdeaImageUrl } from '@apps/pinch/hooks/useIdeaImageUrl';
import { selectRecipesById } from '@apps/pinch/store/selectors';
import type { Idea } from '@apps/pinch/types';
import { getIdeaSiteName } from '@apps/pinch/utils/ideas';

interface IdeaDrawerProps {
  idea: Idea;
  onClose: () => void;
  onModify: (id: string) => void;
  onTurnIntoRecipe: (id: string) => void;
  onOpenRecipe: (recipeId: string) => void;
}

function IdeaDrawer({
  idea,
  onClose,
  onModify,
  onTurnIntoRecipe,
  onOpenRecipe,
}: IdeaDrawerProps) {
  const imageUrl = useIdeaImageUrl(idea);
  const recipe = useAppSelector(selectRecipesById).get(idea.recipeId ?? '');
  const madeRecipe = recipe && recipe.isArchived !== true ? recipe : null;
  const pageUrl = idea.url && /^https?:\/\//i.test(idea.url) ? idea.url : null;
  const siteName = getIdeaSiteName(idea);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title='Idea'
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0'
            onClick={() => onModify(idea.id)}
          >
            Modify
          </Button>
          <Button
            type='button'
            className='min-w-0 flex-1'
            onClick={() =>
              madeRecipe
                ? onOpenRecipe(madeRecipe.id)
                : onTurnIntoRecipe(idea.id)
            }
          >
            {madeRecipe ? 'Open the recipe' : 'Turn it into a recipe'}
          </Button>
        </div>
      }
    >
      <div className='space-y-4'>
        {imageUrl && (
          <FallbackImage
            src={imageUrl}
            alt=''
            className='h-40 w-full rounded-xl object-cover'
          />
        )}
        <h3 className='text-lg font-semibold wrap-break-word'>{idea.title}</h3>
        {idea.note && (
          <p className='text-sm wrap-break-word whitespace-pre-wrap'>
            {idea.note}
          </p>
        )}
        {madeRecipe && (
          <div className='bg-accent border-border overflow-hidden rounded-2xl border'>
            <Button
              type='button'
              variant='tertiary'
              className='text-foreground! h-auto min-h-12 w-full items-start justify-start gap-3 rounded-none py-2 text-left'
              onClick={() => onOpenRecipe(madeRecipe.id)}
            >
              <span className='min-w-0 flex-1 wrap-break-word whitespace-normal'>
                Made into{' '}
                <span className='font-semibold'>{madeRecipe.title}</span>
              </span>
              <ChevronRight
                className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </div>
        )}
        {pageUrl && (
          <div className='bg-muted/50 border-border overflow-hidden rounded-2xl border'>
            <Button
              href={pageUrl}
              target='_blank'
              rel='noopener noreferrer'
              variant='tertiary'
              className='text-foreground! h-auto min-h-12 w-full items-start justify-start gap-3 rounded-none py-2 text-left'
            >
              <span className='w-5 shrink-0 pt-0.5' aria-hidden='true'>
                <ExternalLink className='h-4 w-4' />
              </span>
              <span className='min-w-0 text-left wrap-break-word whitespace-normal'>
                <span className='block'>Open {siteName ?? 'the page'}</span>
                <span className='text-muted-foreground block text-xs font-normal'>
                  Opens in a new tab
                </span>
              </span>
            </Button>
          </div>
        )}
      </div>
    </DetailSheet>
  );
}

export default IdeaDrawer;
