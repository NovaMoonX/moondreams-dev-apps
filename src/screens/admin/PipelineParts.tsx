import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import { MAX_ANSWER_NOTE } from '@lib/admin/pipelineAnswers';

import { WAITING_DOT_CLASS } from './constants';
import {
  getAnswerSlots,
  getEntryActions,
  splitLinks,
  stripLinks,
  type AnswerSlot,
  type PipelineEntry,
  type PipelineGroup,
} from './pipelineUtils';
import {
  getChoiceText,
  type AnswerDraft,
  type SentPr,
} from './usePipelineAnswers';

const DOT_CLASS: Record<PipelineGroup, string> = {
  waiting: WAITING_DOT_CLASS,
  working: 'bg-success',
  quiet: 'bg-warning',
  finished: 'bg-muted-foreground/40',
};

export function StatusDot({ group }: { group: PipelineGroup }) {
  return (
    <span
      aria-hidden='true'
      className={join('size-2 shrink-0 rounded-full', DOT_CLASS[group])}
    />
  );
}

/** The owner's next steps for an entry as buttons: they share a row when the labels fit and stack on the narrowest phones. */
export function EntryActions({
  entry,
  isFilled,
  onAnswer,
}: {
  entry: PipelineEntry;
  /** Only the one action the screen leads with is solid; the rest are outlined. */
  isFilled: boolean;
  /** Opens the entry's questions ready to answer. */
  onAnswer: () => void;
}) {
  const links = getEntryActions(entry);
  const canAnswer = getAnswerSlots(entry).length > 0;
  const count = links.length + (canAnswer ? 1 : 0);
  if (count === 0) return null;
  return (
    <div className={join('grid gap-2', count > 1 && 'min-[380px]:grid-cols-2')}>
      {canAnswer ? (
        <Button
          type='button'
          variant={isFilled ? 'primary' : 'outline'}
          className='w-full whitespace-nowrap'
          onClick={onAnswer}
        >
          Answer
        </Button>
      ) : null}
      {links.map((action, index) => (
        <Button
          key={action.label}
          href={action.href}
          target='_blank'
          rel='noreferrer'
          variant={
            isFilled && !canAnswer && index === 0 ? 'primary' : 'outline'
          }
          className='w-full whitespace-nowrap'
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export function LinkedText({ text }: { text: string }) {
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

export function ImageRow({ cards }: { cards: ImageCard[] }) {
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

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface AnswerFieldsProps {
  slot: AnswerSlot;
  draft: AnswerDraft;
  isSent: boolean;
  error: string | null;
  onChoice: (choice: string | null) => void;
  onNote: (note: string) => void;
}

/** One question with its options as choices, a note under them, and what happened when it was sent. */
export function AnswerFields({
  slot,
  draft,
  isSent,
  error,
  onChoice,
  onNote,
}: AnswerFieldsProps) {
  const options = slot.options.slice(0, LETTERS.length);
  const plain = options.filter((option) => option.images.length === 0);
  const pictured = options.filter((option) => option.images.length > 0);
  const getLetter = (option: (typeof options)[number]) =>
    LETTERS[options.indexOf(option)];
  const chosen = options.findIndex(
    (option) => getChoiceText(option.label) === draft.choice,
  );

  return (
    <div className='space-y-2'>
      <p className='text-foreground text-sm font-medium'>
        <LinkedText text={slot.text} />
      </p>
      {isSent ? (
        <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
          <Check className='size-4' aria-hidden='true' />
          Sent · waiting for the session
        </p>
      ) : (
        <>
          {plain.map((option) => (
            <p
              key={option.label}
              className='text-foreground flex gap-2 text-sm'
            >
              <span className='text-muted-foreground w-4 shrink-0 font-semibold'>
                {getLetter(option)}
              </span>
              <span className='min-w-0'>
                <LinkedText text={option.label} />
              </span>
            </p>
          ))}
          <ImageRow
            cards={pictured.map((option) => ({
              src: option.images[0],
              label: `${getLetter(option)} · ${stripLinks(option.label)}`,
            }))}
          />
          {options.length > 0 ? (
            <PillGroup
              label='Your choice'
              options={options.map((option, index) => ({
                value: String(index),
                label: `Option ${getLetter(option)}`,
                ariaLabel: stripLinks(option.label),
              }))}
              value={chosen >= 0 ? String(chosen) : null}
              onChange={(value) =>
                onChoice(
                  value === String(chosen)
                    ? null
                    : getChoiceText(options[Number(value)].label),
                )
              }
            />
          ) : null}
          <NoteTextField
            label={slot.isReply ? 'Your reply' : 'Add a note'}
            placeholder={
              slot.isReply
                ? 'Answer what was raised'
                : options.length > 0
                  ? 'Optional, or something else entirely'
                  : 'Your answer'
            }
            value={draft.note}
            onChange={onNote}
            maxLength={MAX_ANSWER_NOTE}
            rows={2}
          />
        </>
      )}
      {error ? (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Where the answers went, each pull request a link to its new comment. */
export function SentLine({ sent }: { sent: SentPr[] }) {
  if (sent.length === 0) return null;
  return (
    <p role='status' className='text-muted-foreground text-sm'>
      Sent to{' '}
      {sent.map((pr, index) => (
        <span key={pr.prNumber}>
          {index > 0 ? (index === sent.length - 1 ? ' and ' : ', ') : ''}
          {pr.url ? (
            <a
              href={pr.url}
              target='_blank'
              rel='noreferrer'
              className='text-primary hover:underline'
            >
              #{pr.prNumber}
            </a>
          ) : (
            `#${pr.prNumber}`
          )}
        </span>
      ))}
    </p>
  );
}
