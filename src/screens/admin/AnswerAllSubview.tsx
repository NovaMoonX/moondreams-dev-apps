import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

import { DISABLED_CLASS } from './constants';
import {
  AnswerFields,
  DecisionFields,
  NotSetUpLine,
  SentLine,
  UnsureLine,
  WarningLine,
} from './PipelineParts';
import {
  getAnswerSlots,
  getListedIntro,
  getPrError,
  isListedSlot,
  type PipelineEntry,
} from './pipelineUtils';
import type { PipelineAnswers } from './usePipelineAnswers';

interface AnswerAllSubviewProps {
  entries: PipelineEntry[];
  answers: PipelineAnswers;
  onClose: () => void;
}

/** Every open question across the sessions on one screen, sent together as one comment per pull request. */
function AnswerAllSubview({
  entries,
  answers,
  onClose,
}: AnswerAllSubviewProps) {
  const groups = entries
    .map((entry) => ({ entry, slots: getAnswerSlots(entry) }))
    .filter((group) => group.slots.length > 0);
  const everySlot = groups.flatMap((group) => group.slots);
  const sendState = answers.getSendState(everySlot);
  const readyCount = sendState.readyCount;
  const requestClose = useDiscardGuard({
    isDirty: answers.getTouchedCount(everySlot) > 0,
    onClose: () => {
      answers.clear();
      onClose();
    },
    title: 'Leave without sending?',
    message: 'Your unsent answers will be cleared.',
    confirmText: 'Leave',
    cancelText: 'Keep answering',
  });

  const handleSend = async () => {
    const isAllSent = await answers.send(everySlot);
    if (isAllSent) onClose();
  };

  const getSendLabel = () => {
    if (answers.isSending) return 'Sending…';
    if (sendState.touched === 0) return sendState.label;
    return `Send ${sendState.touched} ${sendState.touched === 1 ? 'answer' : 'answers'}`;
  };

  const getFooterNote = () => {
    if (answers.isNotSetUp) return <NotSetUpLine />;
    if (answers.sendNote) return <WarningLine>{answers.sendNote}</WarningLine>;
    if (answers.unsure.length > 0) return <UnsureLine prs={answers.unsure} />;
    if (sendState.holdNote) return sendState.holdNote;
    if (readyCount === 0 && !answers.isSending) {
      return 'Pick an option or write an answer first';
    }
    return sendState.keepNote ?? undefined;
  };

  return (
    <Subview overlay title='Answer all' onClose={requestClose}>
      <div className='space-y-6 pb-6'>
        <p className='text-muted-foreground text-sm'>
          Pick an option or write your own, and add anything else under each
          session&apos;s questions. Each pull request gets your answers as one
          comment.
        </p>
        {groups.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            Nothing is waiting on you.
          </p>
        ) : null}
        {groups.map(({ entry, slots }) => (
          <section key={entry.key} className='space-y-4'>
            <SectionDivider label={entry.name} />
            <ul className='space-y-5'>
              {slots.map((slot) => (
                <li
                  key={slot.id}
                  className={
                    slot.kind === 'feedback' ? 'border-border border-t pt-4' : undefined
                  }
                >
                  {isListedSlot(slot) ? (
                    <div className='space-y-2'>
                      <p className='text-foreground text-sm font-medium'>
                        {slot.text}
                        {entry.prs.length > 1 ? ` · #${slot.prNumber}` : ''}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {getListedIntro(slot.kind === 'followup' ? 'followup' : 'decision')}
                      </p>
                      <DecisionFields
                        slot={slot}
                        draft={answers.getDraft(slot.id)}
                        isSent={answers.isSent(slot)}
                        error={getPrError(slots, slot, answers.errors)}
                        isSending={answers.isSending}
                        isAtLimit={answers.isAtLimit(slot.prNumber)}
                        onChange={(line, words) =>
                          answers.setChange(slot.id, line, words)
                        }
                      />
                    </div>
                  ) : (
                  <AnswerFields
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
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <SentLine sent={answers.lastSent} issueNote={answers.issueNote} />
      </div>
      <ModalFooterActions
        note={getFooterNote()}
        rightActions={
          <span className='flex justify-end'>
            <Button
              type='button'
              variant='primary'
              className={DISABLED_CLASS}
              disabled={
                readyCount === 0 ||
                sendState.unfinished > 0 ||
                answers.isSending ||
                answers.isNotSetUp
              }
              onClick={() => void handleSend()}
            >
              {getSendLabel()}
            </Button>
          </span>
        }
      />
    </Subview>
  );
}

export default AnswerAllSubview;
