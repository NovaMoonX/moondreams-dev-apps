import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ExternalLink, Play } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import FormSection from '@/components/FormSection';
import { RECIPE_LINK_EMOJIS } from '@apps/pinch/constants';
import type { RecipeLink } from '@apps/pinch/types';
import {
  getHowToLink,
  getLinkHost,
  getLinkLabel,
  getOtherLinks,
  getYouTubeId,
  getYouTubeThumbnailUrl,
} from '@apps/pinch/utils/recipeLinks';

const ROW_CLASS =
  'hover:bg-muted text-foreground! w-full justify-start gap-3 px-3 py-2 text-left font-normal whitespace-normal';

interface HowToCardProps {
  link: RecipeLink;
}

function HowToCard({ link }: HowToCardProps) {
  const videoId = getYouTubeId(link.url);
  const host = getLinkHost(link.url);
  const label = getLinkLabel(link);

  return (
    <div className='border-border overflow-hidden rounded-2xl border'>
      <Button
        href={link.url}
        target='_blank'
        rel='noopener noreferrer'
        variant='tertiary'
        size='stripped'
        rounded='none'
        aria-label={`${label} on ${host}: watch it, opens in a new tab`}
        className={join(ROW_CLASS, 'h-auto items-center')}
      >
        <span
          className='bg-accent relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-xl'
          aria-hidden='true'
        >
          {videoId && (
            <FallbackImage
              src={getYouTubeThumbnailUrl(videoId)}
              alt=''
              className='absolute inset-0 size-full object-cover'
            />
          )}
          <span className='bg-background/90 text-foreground relative grid size-8 place-items-center rounded-full shadow-sm'>
            <Play className='size-4 fill-current' />
          </span>
        </span>
        <span className='min-w-0 flex-1 space-y-0.5'>
          <span className='block font-medium wrap-break-word'>{label}</span>
          <span className='text-muted-foreground block truncate text-xs'>
            {host}
          </span>
          <span className='flex items-center gap-1 text-sm font-medium'>
            Watch
            <ExternalLink className='size-3.5' aria-hidden='true' />
          </span>
        </span>
      </Button>
    </div>
  );
}

interface LinkRowsProps {
  links: RecipeLink[];
}

function LinkRows({ links }: LinkRowsProps) {
  return (
    <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
      {links.map((link) => {
        const label = getLinkLabel(link);
        const host = getLinkHost(link.url);
        return (
          <li key={link.id}>
            <Button
              href={link.url}
              target='_blank'
              rel='noopener noreferrer'
              variant='tertiary'
              size='stripped'
              rounded='none'
              aria-label={`${label} on ${host}, opens in a new tab`}
              className={join(ROW_CLASS, 'min-h-14 items-start')}
            >
              <span
                className='bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-full text-lg leading-none'
                aria-hidden='true'
              >
                {RECIPE_LINK_EMOJIS[link.kind]}
              </span>
              <span className='flex min-h-10 min-w-0 flex-1 flex-col justify-center'>
                <span className='block font-medium wrap-break-word'>
                  {label}
                </span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {host}
                </span>
              </span>
              <ExternalLink
                className='text-muted-foreground mt-3 size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

interface RecipeLinksSectionProps {
  links: RecipeLink[];
}

/** The how-to video as a card, then the other links as rows: all of them open the other site in a new tab. Nothing is drawn for a recipe with no links. */
function RecipeLinksSection({ links }: RecipeLinksSectionProps) {
  const howTo = getHowToLink(links);
  const others = getOtherLinks(links);
  if (howTo === null && others.length === 0) return null;

  return (
    <div className='space-y-5'>
      {howTo && (
        <FormSection title='How to'>
          <HowToCard link={howTo} />
        </FormSection>
      )}
      {others.length > 0 && (
        <FormSection title={howTo ? 'More links' : 'Links'}>
          <LinkRows links={others} />
        </FormSection>
      )}
    </div>
  );
}

export default RecipeLinksSection;
