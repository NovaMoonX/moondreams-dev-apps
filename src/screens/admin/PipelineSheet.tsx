import { Button } from '@moondreamsdev/dreamer-ui/components';

import { ClaudeMark, GitHubMark } from '@/components/BrandMarks';
import DetailSheet from '@/components/DetailSheet';

import { DISABLED_CLASS } from './constants';
import ScreenshotGallery from './ScreenshotGallery';
import {
  AnswerRow,
  CiBadge,
  LinkedText,
  NotSetUpLine,
  SentLine,
  StatusDot,
  UnsureLine,
  WarningLine,
} from './PipelineParts';
import {
  getAnswerSlots,
  getAskedSlots,
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

const getOpenTarget = (entry: PipelineEntry) => {
  if (entry.url && !entry.isPrOnly) {
    return {
      href: entry.url,
      label: 'Open in Claude',
      mark: <ClaudeMark className='size-4' />,
    };
  }
  const prUrl = entry.prs.find((pr) => pr.url !== null)?.url ?? null;
  return prUrl
    ? {
        href: prUrl,
        label: 'Open the PR',
        mark: <GitHubMark className='size-4' />,
      }
    : null;
};

interface PipelineSheetProps {
  entry: PipelineEntry | null;
  onClose: () => void;
  answers: PipelineAnswers;
}

/** One session's (or one pull request's) asks, links and screenshots, so the list itself stays one quiet row each. */
function PipelineSheet({ entry, onClose, answers }: PipelineSheetProps) {
  const slots = entry ? getAnswerSlots(entry) : [];
  const asked = getAskedSlots(slots);
  const isAllSent = asked.length > 0 && asked.every(answers.isSent);
  const slotPrs = new Set(slots.map((slot) => slot.prNumber));
  const entryReady = answers.getReadyCount(slots);
  const elsewhereReady = answers.getReadyCount() - entryReady;
  const renderFooter = (entry: PipelineEntry) => {
    const sent = answers.lastSent.filter((pr) => slotPrs.has(pr.prNumber));
    const target = getOpenTarget(entry);
    if (slots.length === 0 && target === null) return undefined;
    const note = answers.isNotSetUp ? (
      <NotSetUpLine />
    ) : slots.length > 0 && entryReady === 0 && !answers.isSending && !isAllSent ? (
      'Pick an option or write an answer first'
    ) : null;
    return (
      <div className='space-y-2 px-4 sm:px-0'>
        {note ? (
          <p
            role='status'
            className='text-muted-foreground text-xs [overflow-wrap:anywhere]'
          >
            {note}
          </p>
        ) : null}
        <div className='flex flex-wrap items-center justify-end gap-2'>
          {target ? (
            <Button
              href={target.href}
              target='_blank'
              rel='noreferrer'
              variant={slots.length > 0 ? 'secondary' : 'primary'}
              className='gap-2'
            >
              {target.mark}
              {target.label}
            </Button>
          ) : null}
          {slots.length > 0 ? (
            <Button
              type='button'
              variant='primary'
              className={DISABLED_CLASS}
              disabled={
                entryReady === 0 || answers.isSending || answers.isNotSetUp
              }
              onClick={() => void answers.send(slots)}
            >
              {answers.isSending ? 'Sending…' : 'Send answers'}
            </Button>
          ) : null}
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
      footer={entry ? renderFooter(entry) : undefined}
    >
      {entry ? (
        <div className='min-w-0 space-y-5 [overflow-wrap:anywhere]'>
          <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'>
            <span className='flex items-center gap-2'>
              <span className='mx-1 flex'>
                <StatusDot group={entry.group ?? 'finished'} />
              </span>
              {entry.lead}
            </span>
            {entry.prs.map((pr) => (
              <span
                key={pr.number}
                className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'
              >
                {pr.url ? (
                  <a
                    href={pr.url}
                    target='_blank'
                    rel='noreferrer'
                    className='hover:text-foreground inline-flex items-center gap-1.5 text-xs hover:underline'
                  >
                    <GitHubMark className='size-3.5 shrink-0' />#{pr.number}
                    {pr.isDraft ? ' · Draft' : ''}
                  </a>
                ) : (
                  <span className='text-xs'>
                    #{pr.number}
                    {pr.isDraft ? ' · Draft' : ''}
                  </span>
                )}
                <CiBadge ci={pr.ci} />
              </span>
            ))}
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
              <ul className='space-y-2'>
                {slots.map((slot) => (
                  <li
                    key={slot.id}
                    className={
                      slot.kind === 'feedback' ? 'border-border !mt-4 border-t pt-4' : undefined
                    }
                  >
                    <AnswerRow
                      slot={slot}
                      draft={answers.getDraft(slot.id)}
                      isSent={answers.isSent(slot)}
                      error={getPrError(slots, slot, answers.errors)}
                      onChoices={(choices, other) =>
                        answers.setChoices(slot.id, choices, other)
                      }
                      onOther={(other) => answers.setOther(slot.id, other)}
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
