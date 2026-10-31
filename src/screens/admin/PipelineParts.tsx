import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Ban,
  Check,
  ChevronRight,
  CircleCheck,
  Ellipsis,
  Maximize2,
  PenLine,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FallbackImage from '@/components/FallbackImage';
import HelpTip from '@/components/HelpTip';
import FormSheet from '@/components/FormSheet';
import ImageViewer from '@/components/ImageViewer';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { MAX_ANSWER_NOTE } from '@lib/admin/pipelineAnswers';
import type { PipelineSettleOutcome } from '@lib/admin/pipelineTypes';

import { DISABLED_CLASS, WAITING_DOT_CLASS } from './constants';
import {
  splitLinks,
  stripLinks,
  type AnswerSlot,
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

const CI_BADGE: Record<string, { words: string; className: string }> = {
  red: {
    words: 'Checks failing',
    className: 'bg-destructive/10 text-destructive',
  },
  running: {
    words: 'Checks running',
    className: 'bg-warning/15 text-warning-foreground dark:text-warning',
  },
  green: { words: 'Checks passing', className: 'bg-success/10 text-success' },
};

export function CiBadge({ ci }: { ci: string }) {
  const badge = CI_BADGE[ci];
  if (!badge) return null;
  return (
    <span
      className={join(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badge.className,
      )}
    >
      <span aria-hidden='true' className='size-1.5 rounded-full bg-current' />
      {badge.words}
    </span>
  );
}

export function StatusDot({ group }: { group: PipelineGroup }) {
  return (
    <span
      aria-hidden='true'
      className={join('size-2 shrink-0 rounded-full', DOT_CLASS[group])}
    />
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
            className='text-primary [overflow-wrap:anywhere] hover:underline'
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

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const getEdgeClass = (isSelected: boolean) =>
  isSelected
    ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-400/10 dark:ring-indigo-400'
    : 'border-border';

function LetterChip({
  letter,
  isSelected,
  isMulti,
}: {
  letter: ReactNode;
  isSelected: boolean;
  isMulti: boolean;
}) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'flex size-6 shrink-0 items-center justify-center text-xs font-semibold',
        isMulti ? 'rounded-md' : 'rounded-full',
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
        Run npm run pipeline:secrets -- token in your terminal: it opens the
        GitHub page for the token and saves it. Sending works a couple of
        minutes later.
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
  onChoices: (choices: string[], other: string | null) => void;
  onOther: (other: string) => void;
  onNote: (note: string) => void;
  isExpanded?: boolean;
}

const ROW_CLASS =
  'h-auto min-h-11 w-full justify-start gap-3 rounded-xl border px-3 py-2 text-left font-normal';

// Inline after a no-break space, so a wrapping label carries its last word down with the tag instead of indenting it.
function RecommendedTag() {
  return (
    <>
      {'\u00a0'}
      <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-px text-[11px] font-medium whitespace-nowrap'>
        Recommended
      </span>
    </>
  );
}

function FreeTextField({
  slot,
  value,
  onChange,
  isExpanded,
}: {
  slot: AnswerSlot;
  value: string;
  onChange: (value: string) => void;
  isExpanded: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (slot.kind === 'feedback' && !isOpen && !isExpanded && value === '') {
    return (
      <Button
        type='button'
        variant='outline'
        size='sm'
        rounded='full'
        className="relative gap-1 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
        onClick={() => setIsOpen(true)}
      >
        <Plus className='size-3.5' aria-hidden='true' />
        Add other feedback
      </Button>
    );
  }
  const words = {
    question: { label: 'Your answer', placeholder: 'Your answer' },
    reply: { label: 'Your reply', placeholder: 'Answer what was raised' },
    feedback: {
      label: 'Anything else?',
      placeholder: "Feedback that isn't an answer to a question above",
    },
    decision: {
      label: 'What should it be instead?',
      placeholder: 'What should it be instead?',
    },
  }[slot.kind];
  return (
    <NoteTextField
      label={words.label}
      placeholder={words.placeholder}
      value={value}
      onChange={onChange}
      maxLength={MAX_ANSWER_NOTE}
      rows={isExpanded ? 4 : 2}
      shouldFocus={isOpen || isExpanded}
    />
  );
}

/** One question as tappable options with an Other row for a typed answer, or a free-text box. */
export function AnswerFields({
  slot,
  draft,
  isSent,
  error,
  onChoices,
  onOther,
  onNote,
  isExpanded = false,
}: AnswerFieldsProps) {
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  const [isOtherFocus, setIsOtherFocus] = useState(false);
  const options = slot.options.slice(0, LETTERS.length);
  const isChosen = (index: number) =>
    draft.choices.includes(getChoiceText(options[index].label));
  const isOther = draft.other !== null;
  const toggle = (index: number) => {
    const text = getChoiceText(options[index].label);
    if (slot.isMulti) {
      onChoices(
        isChosen(index)
          ? draft.choices.filter((choice) => choice !== text)
          : [...draft.choices, text],
        draft.other,
      );
      return;
    }
    onChoices(isChosen(index) ? [] : [text], null);
  };
  const toggleOther = () => {
    setIsOtherFocus(!isOther);
    onChoices(slot.isMulti ? draft.choices : [], isOther ? null : '');
  };
  const indexed = options.map((option, index) => ({ option, index }));
  const plain = indexed.filter(({ option }) => option.images.length === 0);
  const pictured = indexed.filter(({ option }) => option.images.length > 0);
  const previews = pictured.map(({ option, index }) => ({
    caption: `${LETTERS[index]} · ${stripLinks(option.label)}`,
    pictures: [{ src: option.images[0], label: null }],
  }));
  const hasOptions = options.length > 0;

  return (
    <div className='space-y-2'>
      {slot.kind === 'question' ? (
        <div className='space-y-0.5'>
          <p className='text-foreground text-sm font-medium [overflow-wrap:anywhere]'>
            <LinkedText text={slot.text} />
          </p>
          {hasOptions ? (
            <p className='text-muted-foreground text-xs'>
              {slot.isMulti
                ? 'Pick any, or write your own'
                : 'Pick one, or write your own'}
            </p>
          ) : null}
        </div>
      ) : null}
      {isSent ? (
        <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
          <Check className='size-4' aria-hidden='true' />
          Sent · waiting for the session
        </p>
      ) : !hasOptions ? (
        <FreeTextField
          slot={slot}
          value={draft.note}
          onChange={onNote}
          isExpanded={isExpanded}
        />
      ) : (
        <>
          {plain.length > 0 ? (
            <div role='group' aria-label='Your choice' className='space-y-2'>
              {plain.map(({ option, index }) => (
                <Button
                  key={`${option.label}-${index}`}
                  type='button'
                  variant='tertiary'
                  aria-pressed={isChosen(index)}
                  className={join(ROW_CLASS, getEdgeClass(isChosen(index)))}
                  onClick={() => toggle(index)}
                >
                  <LetterChip
                    letter={LETTERS[index]}
                    isSelected={isChosen(index)}
                    isMulti={slot.isMulti}
                  />
                  <span className='text-foreground min-w-0 flex-1 text-sm'>
                    {stripLinks(option.label)}
                    {option.isRecommended ? <RecommendedTag /> : null}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
          {pictured.length > 0 ? (
            <ul aria-label='Your choice' className='grid grid-cols-2 gap-3'>
              {pictured.map(({ option, index }, pictureIndex) => (
                <li
                  key={`${option.label}-${index}`}
                  className='relative min-w-0'
                >
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-pressed={isChosen(index)}
                    className={join(
                      'h-auto w-full min-w-0 flex-col items-stretch justify-start gap-1.5 rounded-xl border p-1.5 text-left font-normal',
                      getEdgeClass(isChosen(index)),
                    )}
                    onClick={() => toggle(index)}
                  >
                    <FallbackImage
                      src={option.images[0]}
                      alt=''
                      className='h-28 w-full rounded-lg object-cover object-top'
                    />
                    <span className='text-foreground line-clamp-2 px-1 pr-8 pb-0.5 text-xs font-medium [overflow-wrap:anywhere]'>
                      {LETTERS[index]} · {stripLinks(option.label)}
                    </span>
                    {option.isRecommended ? (
                      <span className='px-0.5 pb-1 text-left leading-none'>
                        <RecommendedTag />
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    rounded='full'
                    aria-label={`View ${LETTERS[index]} full screen`}
                    className="bg-background/85 text-foreground absolute top-2.5 right-2.5 size-7 min-w-7 p-0 shadow-sm after:absolute after:-inset-2 after:content-['']"
                    onClick={() => setPreviewAt(pictureIndex)}
                  >
                    <Maximize2 className='size-3.5' aria-hidden='true' />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type='button'
            variant='tertiary'
            aria-pressed={isOther}
            className={join(ROW_CLASS, getEdgeClass(isOther))}
            onClick={toggleOther}
          >
            <LetterChip
              letter={<PenLine className='size-3' />}
              isSelected={isOther}
              isMulti={slot.isMulti}
            />
            <span className='text-foreground min-w-0 flex-1 text-sm'>
              Other
            </span>
          </Button>
          {isOther ? (
            <NoteTextField
              label='Your answer'
              placeholder='Write your own answer'
              value={draft.other ?? ''}
              onChange={onOther}
              maxLength={MAX_ANSWER_NOTE}
              rows={2}
              shouldFocus={isOtherFocus}
            />
          ) : null}
          {previewAt !== null ? (
            <ImageViewer
              slides={previews}
              startIndex={previewAt}
              onClose={() => setPreviewAt(null)}
            />
          ) : null}
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

const ROW_WORDS = {
  question: { sheet: 'Answer', empty: 'Not answered yet' },
  reply: { sheet: 'Reply', empty: 'Not answered yet' },
  feedback: { sheet: 'Anything else?', empty: 'Optional' },
  decision: { sheet: 'Decisions I made for you', empty: 'Sounds good' },
};

const getAnswerSummary = (draft: AnswerDraft) => {
  const other = (draft.other ?? '').trim();
  const picks = [
    ...draft.choices,
    ...(other === '' ? [] : [`Other: ${other}`]),
  ];
  const note = draft.note.trim();
  return [...picks, ...(note === '' ? [] : [note])].join(', ');
};

/** A question as one summary row whose fields open in a drawer over the sheet. */
export function AnswerRow(props: AnswerFieldsProps) {
  const { slot, draft, isSent, error } = props;
  const [isOpen, setIsOpen] = useState(false);
  const words = ROW_WORDS[slot.kind];
  const summary = getAnswerSummary(draft);
  const heading =
    slot.kind === 'question'
      ? stripLinks(slot.text)
      : slot.kind === 'reply'
        ? 'Your reply'
        : 'Anything else?';

  const getStatus = () => {
    if (isSent) {
      return (
        <span className='text-muted-foreground inline-flex items-center gap-1'>
          <Check className='size-3.5' aria-hidden='true' />
          Sent · waiting for the session
        </span>
      );
    }
    return summary === '' ? (
      <span className='text-muted-foreground'>{words.empty}</span>
    ) : (
      <span className='text-foreground'>{summary}</span>
    );
  };

  return (
    <div className='space-y-1.5'>
      <Button
        type='button'
        variant='tertiary'
        className={join(
          ROW_CLASS,
          'gap-2 py-2.5',
          summary !== '' && !isSent ? getEdgeClass(true) : 'border-border',
        )}
        disabled={isSent}
        onClick={() => setIsOpen(true)}
      >
        <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span className='text-foreground line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]'>
            {heading}
          </span>
          <span className='line-clamp-1 text-xs [overflow-wrap:anywhere]'>
            {getStatus()}
          </span>
        </span>
        {isSent ? null : (
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        )}
      </Button>
      {error ? (
        <p role='alert'>
          <WarningLine>{error}</WarningLine>
        </p>
      ) : null}
      <FormSheet
        isOpen={isOpen}
        isDrawerWhenShort
        onClose={() => setIsOpen(false)}
        title={words.sheet}
      >
        <div className='space-y-4 pb-2'>
          <AnswerFields {...props} error={null} isExpanded />
        </div>
        <ModalFooterActions
          rightActions={
            <Button
              type='button'
              variant='primary'
              onClick={() => setIsOpen(false)}
            >
              Done
            </Button>
          }
        />
      </FormSheet>
    </div>
  );
}

interface DecisionFieldsProps {
  slot: AnswerSlot;
  draft: AnswerDraft;
  isSent: boolean;
  error: string | null;
  isSending: boolean;
  isDisabled: boolean;
  onChange: (index: number, words: string | null) => void;
  onKeepAll: () => void;
  onSend: () => void;
}

/** The calls a session made for the owner: tick the ones to change and say what instead, or send Sounds good for all. */
export function DecisionFields({
  slot,
  draft,
  isSent,
  error,
  isSending,
  isDisabled,
  onChange,
  onKeepAll,
  onSend,
}: DecisionFieldsProps) {
  const ticked = Object.entries(draft.changes);
  const isReady = ticked.every(([, words]) => words.trim() !== '');
  if (isSent) {
    return (
      <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
        <Check className='size-4' aria-hidden='true' />
        Sent · waiting for the session
      </p>
    );
  }
  return (
    <div className='space-y-3'>
      <ul className='space-y-3'>
        {slot.decisions.map((text, index) => {
          const isTicked = draft.changes[index] !== undefined;
          return (
            <li key={`${text}-${index}`} className='space-y-2'>
              <div className='flex items-start gap-3'>
                <Checkbox
                  className={TICK_HIT_CLASS}
                  checked={isTicked}
                  disabled={isSending}
                  onCheckedChange={(next) => onChange(index, next ? '' : null)}
                  aria-label={`Change: ${stripLinks(text)}`}
                />
                <p className='text-foreground min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'>
                  <LinkedText text={text} />
                </p>
              </div>
              {isTicked ? (
                <div className='pl-8'>
                  <NoteTextField
                    label='What should it be instead?'
                    placeholder='What should it be instead?'
                    value={draft.changes[index]}
                    onChange={(words) => onChange(index, words)}
                    maxLength={MAX_ANSWER_NOTE}
                    rows={2}
                    shouldFocus
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Button
        type='button'
        variant={ticked.length > 0 ? 'primary' : 'secondary'}
        className={DISABLED_CLASS}
        disabled={isDisabled || isSending || !isReady}
        onClick={ticked.length > 0 ? onSend : onKeepAll}
      >
        {isSending
          ? 'Sending…'
          : ticked.length > 0
            ? `Send ${ticked.length} ${ticked.length === 1 ? 'change' : 'changes'}`
            : 'Sounds good'}
      </Button>
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

type SettleChoice = PipelineSettleOutcome | 'open';

interface SettleProps {
  text: string;
  /** Listed in a status comment, so settling it ticks its line there for the session to read. */
  hasPr: boolean;
  settled: PipelineSettleOutcome | null;
  isBusy: boolean;
  error: string | null;
  onSettle: (choice: SettleChoice) => void;
}

// A 20px box gets a 40px hit area from a pseudo-element.
const TICK_HIT_CLASS =
  "relative mt-0.5 before:absolute before:-inset-[10px] before:content-['']";

function SettledLine({
  words,
  isBusy,
  onUndo,
}: {
  words: string;
  isBusy: boolean;
  onUndo: () => void;
}) {
  return (
    <span className='text-muted-foreground flex items-center gap-2 text-xs'>
      <Check className='size-3.5 shrink-0' aria-hidden='true' />
      {words}
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className="text-primary relative h-auto px-1 py-0 text-xs before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
        disabled={isBusy}
        onClick={onUndo}
      >
        Undo
      </Button>
    </span>
  );
}

/** A quiet ⋯ that opens a small sheet to say it's handled or not happening, so the ask stops waiting. */
function SetAsideButton({
  text,
  isTask,
  hasPr,
  isBusy,
  onSettle,
}: {
  text: string;
  isTask: boolean;
  hasPr: boolean;
  isBusy: boolean;
  onSettle: (choice: PipelineSettleOutcome) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const choose = (choice: PipelineSettleOutcome) => {
    setIsOpen(false);
    onSettle(choice);
  };
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        rounded='full'
        aria-label={`Set aside: ${stripLinks(text)}`}
        className="text-muted-foreground relative size-8 min-w-8 shrink-0 p-0 after:absolute after:-inset-1 after:content-['']"
        disabled={isBusy}
        onClick={() => setIsOpen(true)}
      >
        <Ellipsis className='size-4' aria-hidden='true' />
      </Button>
      <FormSheet
        isOpen={isOpen}
        isDrawerWhenShort
        onClose={() => setIsOpen(false)}
        title='Set this aside'
      >
        <div className='space-y-3 pb-2'>
          <p className='text-muted-foreground text-sm [overflow-wrap:anywhere]'>
            {stripLinks(text)}
          </p>
          <ActionGroup>
            <ActionRow
              isGrouped
              icon={<CircleCheck />}
              label={isTask ? 'I already did it' : 'Already handled'}
              subtitle={
                hasPr ? 'Ticked on the PR for the session to see' : undefined
              }
              onClick={() => choose('done')}
            />
            <ActionRow
              isGrouped
              icon={<Ban />}
              label="I'm not doing it"
              subtitle={
                hasPr ? 'Ticked on the PR with a note saying so' : undefined
              }
              onClick={() => choose('skipped')}
            />
          </ActionGroup>
        </div>
      </FormSheet>
    </>
  );
}

/** One step for the owner as a box to tick; ticking it ticks its line on GitHub too, and the menu sets it aside instead. */
export function TaskRow({
  text,
  hasPr,
  settled,
  isBusy,
  error,
  onSettle,
}: SettleProps) {
  const label = stripLinks(text);
  return (
    <div className='space-y-1'>
      <div className='flex items-start gap-3'>
        <Checkbox
          className={TICK_HIT_CLASS}
          checked={settled === 'done'}
          disabled={isBusy}
          onCheckedChange={(next) => onSettle(next ? 'done' : 'open')}
          aria-label={`Done: ${label}`}
        />
        <div className='min-w-0 flex-1 space-y-0.5'>
          <p
            className={join(
              'text-sm [overflow-wrap:anywhere]',
              settled === null ? 'text-foreground' : 'text-muted-foreground',
              settled === 'done' && 'line-through',
            )}
          >
            <LinkedText text={text} />
          </p>
          {settled !== null ? (
            <SettledLine
              words={settled === 'done' ? 'Done' : 'Not doing it'}
              isBusy={isBusy}
              onUndo={() => onSettle('open')}
            />
          ) : null}
        </div>
        {settled === null ? (
          <span className='-mt-1.5 flex'>
            <SetAsideButton
              text={text}
              isTask
              hasPr={hasPr}
              isBusy={isBusy}
              onSettle={onSettle}
            />
          </span>
        ) : null}
      </div>
      {error ? (
        <p role='alert'>
          <WarningLine>{error}</WarningLine>
        </p>
      ) : null}
    </div>
  );
}

/** A question with a menu to set it aside; once set aside it shows as one muted line with its Undo. */
export function DismissibleAsk({
  text,
  hasPr,
  settled,
  isBusy,
  error,
  onSettle,
  children,
}: SettleProps & { children: ReactNode }) {
  if (settled !== null) {
    return (
      <div className='space-y-0.5'>
        <p className='text-muted-foreground text-sm [overflow-wrap:anywhere]'>
          {stripLinks(text)}
        </p>
        <SettledLine
          words={settled === 'done' ? 'Already handled' : 'Not doing it'}
          isBusy={isBusy}
          onUndo={() => onSettle('open')}
        />
        {error ? (
          <p role='alert'>
            <WarningLine>{error}</WarningLine>
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className='space-y-1'>
      <div className='flex items-start gap-2'>
        <div className='min-w-0 flex-1'>{children}</div>
        <span className='mt-1.5 flex'>
          <SetAsideButton
            text={text}
            isTask={false}
            hasPr={hasPr}
            isBusy={isBusy}
            onSettle={onSettle}
          />
        </span>
      </div>
      {error ? (
        <p role='alert'>
          <WarningLine>{error}</WarningLine>
        </p>
      ) : null}
    </div>
  );
}
