import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { ClaudeMark, GitHubMark } from '@/components/BrandMarks';
import DetailSheet from '@/components/DetailSheet';

import { DISABLED_CLASS } from './constants';
import ScreenshotGallery from './ScreenshotGallery';
import {
  AnswerFields,
  LinkedText,
  NotSetUpLine,
  SentLine,
  StatusDot,
  UnsureLine,
  WarningLine,
} from './PipelineParts';
import {
  CI_WORDS,
  getAnswerSlots,
  getPrError,
  type PipelineEntry,
} from './pipelineUtils';
import type { PipelineAnswers } from './usePipelineAnswers';

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
  answers: PipelineAnswers;
}

/** One session's (or one pull request's) asks, links and screenshots, so the list itself stays one quiet row each. */
function PipelineSheet({ entry, onClose, answers }: PipelineSheetProps) {
  const slots = entry ? getAnswerSlots(entry) : [];
  const isAllSent = slots.length > 0 && slots.every(answers.isSent);
  const slotPrs = new Set(slots.map((slot) => slot.prNumber));
  const entryReady = answers.getReadyCount(slots);
  const elsewhereReady = answers.getReadyCount() - entryReady;
  const renderFooter = () => {
    const sent = answers.lastSent.filter((pr) => slotPrs.has(pr.prNumber));
    if (slots.length === 0) return undefined;
    return (
      <div className='space-y-2 px-4 sm:px-0'>
        <div className='flex items-center justify-between gap-3'>
          <p
            role='status'
            className='text-muted-foreground min-w-0 text-xs [overflow-wrap:anywhere]'
          >
            {answers.isNotSetUp ? (
              <NotSetUpLine />
            ) : entryReady === 0 && !answers.isSending && !isAllSent ? (
              'Pick an option or add a note first'
            ) : null}
          </p>
          <Button
            type='button'
            variant='primary'
            className={join('shrink-0', DISABLED_CLASS)}
            disabled={
              entryReady === 0 || answers.isSending || answers.isNotSetUp
            }
            onClick={() => void answers.send(slots)}
          >
            {answers.isSending ? 'Sending…' : 'Send answers'}
          </Button>
        </div>
        {answers.sendNote ? (
          <p role='alert'>
            <WarningLine>{answers.sendNote}</WarningLine>
          </p>
        ) : null}
        {answers.unsure.length > 0 ? (
          <p role='alert'>
            <UnsureLine prs={answers.unsure} />
          </p>
        ) : null}
        <SentLine sent={sent} />
        {elsewhereReady > 0 ? (
          <p className='text-muted-foreground text-xs'>
            {elsewhereReady} {elsewhereReady === 1 ? 'answer' : 'answers'} ready
            to send from other sessions
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <DetailSheet
      isOpen={entry !== null}
      onClose={onClose}
      title={entry?.name ?? 'Session'}
      footer={entry ? renderFooter() : undefined}
    >
      {entry ? (
        <div className='min-w-0 space-y-5 [overflow-wrap:anywhere]'>
          <div className='space-y-2'>
            <p className='text-muted-foreground flex items-start gap-2 text-sm'>
              <span className='flex pt-1.5'>
                <StatusDot group={entry.group ?? 'finished'} />
              </span>
              {entry.lead}
            </p>
            <ul className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs'>
              {entry.prs.map((pr) => (
                <li key={pr.number} className='min-w-0'>
                  {pr.url ? (
                    <a
                      href={pr.url}
                      target='_blank'
                      rel='noreferrer'
                      className='hover:text-foreground inline-flex min-w-0 items-center gap-1.5 hover:underline'
                    >
                      <GitHubMark className='size-3.5 shrink-0' />
                      <span className='truncate'>
                        #{pr.number} · {pr.isDraft ? 'Draft' : 'Ready'} ·{' '}
                        {CI_WORDS[pr.ci]}
                      </span>
                    </a>
                  ) : (
                    <span>
                      #{pr.number} · {pr.isDraft ? 'Draft' : 'Ready'}
                    </span>
                  )}
                </li>
              ))}
              {entry.url && !entry.isPrOnly ? (
                <li>
                  <a
                    href={entry.url}
                    target='_blank'
                    rel='noreferrer'
                    className='hover:text-foreground inline-flex items-center gap-1.5 hover:underline'
                  >
                    <ClaudeMark className='size-3.5 shrink-0' />
                    Open the session
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          {slots.length > 0 ? (
            <SheetSection title='Needs you'>
              {entry.ownerItems.length === 0 ? (
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
              ) : null}
              <ul className='space-y-5'>
                {slots.map((slot) => (
                  <li key={slot.id}>
                    <AnswerFields
                      slot={slot}
                      draft={answers.getDraft(slot.id)}
                      isSent={answers.isSent(slot)}
                      error={getPrError(slots, slot, answers.errors)}
                      onChoice={(choice) => answers.setChoice(slot.id, choice)}
                      onNote={(note) => answers.setNote(slot.id, note)}
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

          {entry.gallery.length > 0 ? (
            <SheetSection title='Screenshots'>
              <ScreenshotGallery items={entry.gallery} />
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
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default PipelineSheet;
