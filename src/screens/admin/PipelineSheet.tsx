import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';
import FallbackImage from '@/components/FallbackImage';
import type { PipelineInboxPr } from '@lib/admin/pipelineTypes';

import { splitLinks, type PipelineEntry } from './pipelineUtils';

const CI_WORDS: Record<PipelineInboxPr['ci'], string> = {
  green: 'checks passing',
  red: 'checks failing',
  running: 'checks running',
  none: 'no checks',
};

function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target='_blank'
            rel='noreferrer'
            className='text-primary hover:underline'
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Thumbnails({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <ul className='flex gap-2 overflow-x-auto pb-1'>
      {images.map((src) => (
        <li key={src} className='shrink-0'>
          <a
            href={src}
            target='_blank'
            rel='noreferrer'
            aria-label='Open screenshot full size'
          >
            <FallbackImage
              src={src}
              alt=''
              className='border-border h-40 w-auto rounded-lg border object-cover'
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

function SheetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className='space-y-2'>
      <h3 className='text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase'>
        {title}
      </h3>
      {children}
    </section>
  );
}

interface PipelineSheetProps {
  entry: PipelineEntry | null;
  onClose: () => void;
}

/** One session's (or one pull request's) asks, links and screenshots, so the list itself stays one quiet row each. */
function PipelineSheet({ entry, onClose }: PipelineSheetProps) {
  return (
    <DetailSheet
      isOpen={entry !== null}
      onClose={onClose}
      title={entry?.name ?? 'Session'}
      footer={
        entry?.url ? (
          <Button
            href={entry.url}
            target='_blank'
            rel='noreferrer'
            size='lg'
            className='w-full'
          >
            Open in Claude
          </Button>
        ) : undefined
      }
    >
      {entry ? (
        <div className='space-y-5'>
          {entry.raisedHands.length > 0 ? (
            <SheetSection title='Raised for you'>
              <ul className='space-y-2'>
                {entry.raisedHands.map((line) => (
                  <li key={line} className='text-foreground text-sm'>
                    <LinkedText text={line} />
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {entry.prs.length > 0 ? (
            <SheetSection title='Pull requests'>
              <ul className='space-y-2'>
                {entry.prs.map((pr) => (
                  <li key={pr.number} className='min-w-0'>
                    <ExternalLinkText
                      href={pr.url}
                      label={`#${pr.number} ${pr.title}`}
                    />
                    <p className='text-muted-foreground text-xs'>
                      {pr.isDraft ? 'Draft' : 'Ready for review'} ·{' '}
                      {CI_WORDS[pr.ci]}
                    </p>
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {entry.ownerItems.length > 0 ? (
            <SheetSection title='Needs you'>
              <ul className='space-y-4'>
                {entry.ownerItems.map((item) => (
                  <li key={item.text} className='space-y-2'>
                    <p className='text-foreground text-sm font-medium'>
                      <LinkedText text={item.text} />
                    </p>
                    {item.options.map((option) => (
                      <div key={option.label} className='space-y-1.5'>
                        <p className='text-foreground text-sm'>
                          <LinkedText text={option.label} />
                        </p>
                        <Thumbnails images={option.images} />
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {entry.goodToKnow.length > 0 ? (
            <SheetSection title='Good to know'>
              <ul className='space-y-1.5'>
                {entry.goodToKnow.map((line) => (
                  <li key={line} className='text-muted-foreground text-sm'>
                    <LinkedText text={line} />
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {entry.screenshots.length > 0 ? (
            <SheetSection title='Latest screenshots'>
              <Thumbnails images={entry.screenshots} />
            </SheetSection>
          ) : null}

          {entry.raisedHands.length +
            entry.prs.length +
            entry.ownerItems.length ===
          0 ? (
            <p className='text-muted-foreground text-sm'>
              Nothing needs you here right now.
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default PipelineSheet;
