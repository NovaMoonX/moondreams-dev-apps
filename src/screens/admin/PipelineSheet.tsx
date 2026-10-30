import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';
import FallbackImage from '@/components/FallbackImage';

import { EntryActions, StatusDot } from './PipelineParts';
import {
  CI_WORDS,
  getEntryActions,
  splitLinks,
  stripLinks,
  type PipelineEntry,
} from './pipelineUtils';

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

interface ImageCard {
  src: string;
  label: string | null;
}

function ImageRow({ cards }: { cards: ImageCard[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className='-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1'>
      {cards.map((card, index) => (
        <li key={`${card.src}-${index}`} className='w-40 shrink-0 snap-start'>
          <a
            href={card.src}
            target='_blank'
            rel='noreferrer'
            className='block space-y-1.5'
            aria-label={card.label ?? 'Open screenshot full size'}
          >
            <FallbackImage
              src={card.src}
              alt=''
              className='border-border h-28 w-full rounded-lg border object-cover'
            />
            {card.label ? (
              <span className='text-foreground line-clamp-2 text-xs'>
                {card.label}
              </span>
            ) : null}
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
      <h3 className='text-foreground text-base font-semibold'>{title}</h3>
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
  const optionImages = new Set(
    entry?.ownerItems.flatMap((item) =>
      item.options.flatMap((option) => option.images.slice(0, 1)),
    ) ?? [],
  );
  const screenshots = (entry?.screenshots ?? []).filter(
    (src) => !optionImages.has(src),
  );

  return (
    <DetailSheet
      isOpen={entry !== null}
      onClose={onClose}
      title={entry?.name ?? 'Session'}
      footer={
        entry && getEntryActions(entry).length > 0 ? (
          <div>
            <div className='px-4 sm:px-0'>
              <EntryActions entry={entry} />
            </div>
          </div>
        ) : undefined
      }
    >
      {entry ? (
        <div className='space-y-5'>
          <div className='flex items-start gap-2'>
            <span className='flex pt-1.5'>
              <StatusDot group={entry.group ?? 'finished'} />
            </span>
            <p className='text-muted-foreground text-sm'>{entry.lead}</p>
          </div>

          {entry.ownerItems.length > 0 ? (
            <SheetSection title='Needs you'>
              <ul className='space-y-4'>
                {entry.ownerItems.map((item, itemIndex) => (
                  <li key={`${item.text}-${itemIndex}`} className='space-y-2'>
                    <p className='text-foreground text-sm font-medium'>
                      <LinkedText text={item.text} />
                    </p>
                    {item.options.map((option, optionIndex) =>
                      option.images.length === 0 ? (
                        <p
                          key={`${option.label}-${optionIndex}`}
                          className='text-foreground text-sm'
                        >
                          <LinkedText text={option.label} />
                        </p>
                      ) : null,
                    )}
                    <ImageRow
                      cards={item.options.flatMap((option) =>
                        option.images.length === 0
                          ? []
                          : [
                              {
                                src: option.images[0],
                                label: stripLinks(option.label),
                              },
                            ],
                      )}
                    />
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : entry.raisedHands.length > 0 ? (
            <SheetSection title='Needs you'>
              <ul className='space-y-2'>
                {entry.raisedHands.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className='text-foreground text-sm'
                  >
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
                    {pr.url ? (
                      <ExternalLinkText
                        href={pr.url}
                        label={`#${pr.number} ${pr.title}`}
                      />
                    ) : (
                      <p className='text-foreground text-sm'>
                        #{pr.number} {pr.title}
                      </p>
                    )}
                    <p className='text-muted-foreground text-xs'>
                      {pr.isDraft ? 'Draft' : 'Ready for review'} ·{' '}
                      {CI_WORDS[pr.ci]}
                    </p>
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {entry.goodToKnow.length > 0 ? (
            <SheetSection title='Good to know'>
              <ul className='space-y-1.5'>
                {entry.goodToKnow.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className='text-muted-foreground text-sm'
                  >
                    <LinkedText text={line} />
                  </li>
                ))}
              </ul>
            </SheetSection>
          ) : null}

          {screenshots.length > 0 ? (
            <SheetSection title='Latest screenshots'>
              <ImageRow
                cards={screenshots.map((src) => ({ src, label: null }))}
              />
            </SheetSection>
          ) : null}
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default PipelineSheet;
