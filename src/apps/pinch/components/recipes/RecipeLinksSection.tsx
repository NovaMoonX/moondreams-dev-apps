import { lazy, Suspense } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ExternalLink } from 'lucide-react';

import FormSection from '@/components/FormSection';
import { RECIPE_LINK_EMOJIS } from '@apps/pinch/constants';
import type { RecipeLink } from '@apps/pinch/types';
import {
  getHowToLink,
  getInlineVideo,
  getLinkHost,
  getLinkLabel,
  getOtherLinks,
  type InlineVideo,
} from '@apps/pinch/utils/recipeLinks';

const DEFAULT_REL = 'noopener noreferrer';

const ROW_CLASS =
  'hover:bg-muted text-foreground! w-full justify-start gap-3 px-3 py-2 text-left font-normal whitespace-normal';

const HowToVideo = lazy(
  () => import('@apps/pinch/components/recipes/HowToVideo'),
);

const VIDEO_FRAME_CLASS =
  'bg-accent border-border aspect-video rounded-2xl border';

interface HowToPlayerProps {
  link: RecipeLink;
  video: InlineVideo;
}

function HowToPlayer({ link, video }: HowToPlayerProps) {
  const host = getLinkHost(link.url);

  return (
    <div className='space-y-2'>
      <Suspense fallback={<div className={VIDEO_FRAME_CLASS} />}>
        <HowToVideo
          video={video}
          ariaLabel={`Play ${getLinkLabel(link)} from ${host}`}
        />
      </Suspense>
      {link.label !== null && (
        <p className='text-muted-foreground text-sm wrap-break-word'>
          {link.label}
        </p>
      )}
    </div>
  );
}

interface LinkRowsProps {
  links: RecipeLink[];
  rel: string;
}

function LinkRows({ links, rel }: LinkRowsProps) {
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
              rel={rel}
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
  /** What the links tell the other site; a page someone else made adds `nofollow ugc`. */
  rel?: string;
  /** Plays nothing and draws no picture from another site, for a page whose visitors didn't ask to reach one: the how-to video is a link row there. */
  isPlayerHidden?: boolean;
}

/** The how-to video plays in place (the host's player loads on the tap); every other link, and the video when it can't play here, is a row that opens the other site in a new tab. Nothing is drawn for a recipe with no links. */
function RecipeLinksSection({
  links,
  rel = DEFAULT_REL,
  isPlayerHidden = false,
}: RecipeLinksSectionProps) {
  const howTo = getHowToLink(links);
  const video =
    howTo === null || isPlayerHidden ? null : getInlineVideo(howTo.url);
  const rows = video === null ? links : getOtherLinks(links);
  if (howTo === null && rows.length === 0) return null;

  return (
    <div className='space-y-5'>
      {howTo && video && <HowToPlayer link={howTo} video={video} />}
      {rows.length > 0 && (
        <FormSection title='Links'>
          <LinkRows links={rows} rel={rel} />
        </FormSection>
      )}
    </div>
  );
}

export default RecipeLinksSection;
