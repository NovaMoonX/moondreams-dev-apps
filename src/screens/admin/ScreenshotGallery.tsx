import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';
import ImageViewer, { type ViewerSlide } from '@/components/ImageViewer';

import type { GalleryItem } from './pipelineUtils';

const ROLE_WORDS = { before: 'Before', after: 'After' } as const;

function ScreenshotGallery({ items }: { items: GalleryItem[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (items.length === 0) return null;

  const slides: ViewerSlide[] = items.map((item) => ({
    caption: item.step === null ? item.label : `${item.step} · ${item.label}`,
    pictures: item.shots.map((shot) => ({
      src: shot.src,
      label: shot.role ? ROLE_WORDS[shot.role] : null,
    })),
  }));
  const isFlow = items.filter((item) => item.step !== null).length >= 2;

  return (
    <>
      <ol className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
        {items.map((item, itemIndex) => (
          <li key={item.id} className='min-w-0'>
            <Button
              type='button'
              variant='tertiary'
              aria-label={`Open ${item.label} full screen`}
              className='border-border/60 bg-muted/40 hover:bg-muted/70 h-full w-full min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden rounded-xl border p-0 text-left font-normal'
              onClick={() => setOpenAt(itemIndex)}
            >
              <span
                className={join(
                  'bg-border/60 grid h-36 w-full gap-px',
                  item.shots.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                )}
              >
                {item.shots.map((shot) => (
                  <span key={shot.src} className='relative block min-w-0 overflow-hidden bg-white dark:bg-zinc-900'>
                    <FallbackImage
                      src={shot.src}
                      alt=''
                      className='size-full object-cover object-top'
                    />
                    {shot.role ? (
                      <span className='absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] whitespace-nowrap leading-none font-medium text-white'>
                        {ROLE_WORDS[shot.role]}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
              <span className='flex items-start gap-2 p-2'>
                {isFlow && item.step !== null ? (
                  <span
                    aria-hidden='true'
                    className='bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold'
                  >
                    {item.step}
                  </span>
                ) : null}
                <span className='text-foreground line-clamp-2 min-w-0 text-xs [overflow-wrap:anywhere]'>
                  {item.label}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ol>
      {openAt !== null ? (
        <ImageViewer
          slides={slides}
          startIndex={openAt}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  );
}

export default ScreenshotGallery;
