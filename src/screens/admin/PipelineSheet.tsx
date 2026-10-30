import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';

import { DISABLED_CLASS } from './constants';
import {
  AnswerFields,
  ImageRow,
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
  getEntryActions,
  getEntryPrUrl,
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
  const optionImages = new Set(
    entry?.ownerItems.flatMap((item) =>
      item.options.flatMap((option) => option.images.slice(0, 1)),
    ) ?? [],
  );
  const screenshots = (entry?.screenshots ?? []).filter(
    (src) => !optionImages.has(src),
  );

  const renderFooter = (current: PipelineEntry) => {
    const links = getEntryActions(current);
    const prUrl = getEntryPrUrl(current);
    const sent = answers.lastSent.filter((pr) => slotPrs.has(pr.prNumber));
    if (slots.length === 0 && links.length === 0 && !prUrl) return undefined;
    return (
      <div className='space-y-2 px-4 sm:px-0'>
        {slots.length > 0 ? (
          <>
            <Button
              type='button'
              variant='primary'
              className={join('w-full', DISABLED_CLASS)}
              disabled={
                entryReady === 0 || answers.isSending || answers.isNotSetUp
              }
              onClick={() => void answers.send(slots)}
            >
              {answers.isSending ? 'Sending…' : 'Send answers'}
            </Button>
            {answers.isNotSetUp ? (
              <p role='status'>
                <NotSetUpLine />
              </p>
            ) : entryReady === 0 && !answers.isSending && !isAllSent ? (
              <p role='status' className='text-muted-foreground text-xs'>
                Pick an option or add a note first
              </p>
            ) : null}
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
                {elsewhereReady} {elsewhereReady === 1 ? 'answer' : 'answers'}{' '}
                ready to send from other sessions
              </p>
            ) : null}
          </>
        ) : null}
        {links.length > 0 || prUrl ? (
          <div className='grid grid-cols-2 gap-2'>
            {[
              ...links,
              ...(prUrl ? [{ label: 'Open the PR', href: prUrl }] : []),
            ].map((action) => (
              <Button
                key={action.label}
                href={action.href}
                target='_blank'
                rel='noreferrer'
                variant='outline'
                className='w-full px-2 text-xs whitespace-nowrap min-[380px]:px-4 min-[380px]:text-sm'
              >
                {action.label}
              </Button>
            ))}
          </div>
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
        <div className='space-y-5'>
          <div className='flex items-start gap-2'>
            <span className='flex pt-1.5'>
              <StatusDot group={entry.group ?? 'finished'} />
            </span>
            <p className='text-muted-foreground text-sm'>{entry.lead}</p>
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
