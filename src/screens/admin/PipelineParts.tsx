import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Maximize2, Plus, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import FallbackImage from '@/components/FallbackImage';
import HelpTip from '@/components/HelpTip';
import NoteTextField from '@/components/NoteTextField';
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
  const isClaudeOnly = !canAnswer && entry.asks.length > 0;
  if (count === 0 && !isClaudeOnly) return null;
  return (
    <div className='space-y-2'>
      <div
        className={join('grid gap-2', count > 1 && 'min-[380px]:grid-cols-2')}
      >
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
      {isClaudeOnly ? (
        <p className='text-muted-foreground text-xs'>
          Answer this one in Claude
        </p>
      ) : null}
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

const getEdgeClass = (isSelected: boolean) =>
  isSelected
    ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-400/10 dark:ring-indigo-400'
    : 'border-border';

function LetterChip({
  letter,
  isSelected,
}: {
  letter: string;
  isSelected: boolean;
}) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        isSelected
          ? 'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-zinc-900'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

/** A quiet one-line warning: the icon carries the colour, the words stay readable. */
export function WarningLine({ children }: { children: ReactNode }) {
  return (
    <span className='text-foreground inline-flex items-start gap-1.5 text-xs'>
      <TriangleAlert
        className='text-warning mt-px size-3.5 shrink-0'
        aria-hidden='true'
      />
      <span>{children}</span>
    </span>
  );
}

export function NotSetUpLine() {
  return (
    <span className='inline-flex items-center gap-1'>
      <WarningLine>Answering isn&apos;t set up yet.</WarningLine>
      <HelpTip title="Answering isn't set up">
        Add a GitHub token as PIPELINE_GITHUB_TOKEN; see the PR notes.
      </HelpTip>
    </span>
  );
}

/** The pull requests to check when a send ended without an answer. */
export function UnsureLine({ prs }: { prs: SentPr[] }) {
  if (prs.length === 0) return null;
  return (
    <WarningLine>
      We couldn&apos;t tell whether these went through. Check the PR before
      sending again:{' '}
      {prs.map((pr, index) => (
        <span key={pr.prNumber}>
          {index > 0 ? ', ' : ''}
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
    </WarningLine>
  );
}

interface AnswerFieldsProps {
  slot: AnswerSlot;
  draft: AnswerDraft;
  isSent: boolean;
  error: string | null;
  onChoice: (choice: string | null) => void;
  onNote: (note: string) => void;
}

/** One question with its options as tappable rows (a picture makes its option a card), an optional note, and what happened when it was sent. */
export function AnswerFields({
  slot,
  draft,
  isSent,
  error,
  onChoice,
  onNote,
}: AnswerFieldsProps) {
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const options = slot.options.slice(0, LETTERS.length);
  const chosen = options.findIndex(
    (option) => getChoiceText(option.label) === draft.choice,
  );
  const isNoteShown =
    slot.isReply || options.length === 0 || isNoteOpen || draft.note !== '';
  const toggle = (index: number) =>
    onChoice(index === chosen ? null : getChoiceText(options[index].label));
  const indexed = options.map((option, index) => ({ option, index }));
  const plain = indexed.filter(({ option }) => option.images.length === 0);
  const pictured = indexed.filter(({ option }) => option.images.length > 0);

  const getNoteLabel = () => {
    if (slot.isReply) return 'Your reply';
    return options.length > 0 ? 'Your note' : 'Your answer';
  };

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
          {plain.length > 0 ? (
            <div role='group' aria-label='Your choice' className='space-y-2'>
              {plain.map(({ option, index }) => (
                <Button
                  key={`${option.label}-${index}`}
                  type='button'
                  variant='tertiary'
                  aria-pressed={index === chosen}
                  className={join(
                    'h-auto min-h-11 w-full justify-start gap-3 rounded-xl border px-3 py-2 text-left font-normal',
                    getEdgeClass(index === chosen),
                  )}
                  onClick={() => toggle(index)}
                >
                  <LetterChip
                    letter={LETTERS[index]}
                    isSelected={index === chosen}
                  />
                  <span className='text-foreground min-w-0 flex-1 text-sm'>
                    {stripLinks(option.label)}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
          {pictured.length > 0 ? (
            <ul
              aria-label='Your choice'
              className='-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1'
            >
              {pictured.map(({ option, index }) => (
                <li
                  key={`${option.label}-${index}`}
                  className='relative w-40 shrink-0 snap-start'
                >
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-pressed={index === chosen}
                    className={join(
                      'h-auto w-full flex-col items-stretch justify-start gap-1.5 rounded-xl border p-1.5 text-left font-normal',
                      getEdgeClass(index === chosen),
                    )}
                    onClick={() => toggle(index)}
                  >
                    <FallbackImage
                      src={option.images[0]}
                      alt=''
                      className='h-28 w-full rounded-lg object-cover'
                    />
                    <span className='text-foreground line-clamp-2 px-1 pb-0.5 text-xs font-medium'>
                      {LETTERS[index]} · {stripLinks(option.label)}
                    </span>
                  </Button>
                  <a
                    href={option.images[0]}
                    target='_blank'
                    rel='noreferrer'
                    aria-label={`Open ${LETTERS[index]} full size`}
                    className="bg-background/85 text-foreground absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full shadow-sm after:absolute after:-inset-2 after:content-['']"
                  >
                    <Maximize2 className='size-3.5' aria-hidden='true' />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {isNoteShown ? (
            <NoteTextField
              label={getNoteLabel()}
              placeholder={
                slot.isReply
                  ? 'Answer what was raised'
                  : options.length > 0
                    ? 'Something to add, or something else entirely'
                    : 'Your answer'
              }
              value={draft.note}
              onChange={onNote}
              maxLength={MAX_ANSWER_NOTE}
              rows={2}
              shouldFocus={isNoteOpen}
            />
          ) : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              rounded='full'
              className="relative gap-1 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
              onClick={() => setIsNoteOpen(true)}
            >
              <Plus className='size-3.5' aria-hidden='true' />
              Add a note
            </Button>
          )}
        </>
      )}
      {error ? (
        <p role='alert'>
          <WarningLine>{error}</WarningLine>
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
