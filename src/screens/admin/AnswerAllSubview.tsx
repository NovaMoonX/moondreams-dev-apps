import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

import { AnswerFields, SentLine } from './PipelineParts';
import { getAnswerSlots, type PipelineEntry } from './pipelineUtils';
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
  const readyCount = answers.getReadyCount();
  const requestClose = useDiscardGuard({
    isDirty: readyCount > 0,
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
    const isAllSent = await answers.send(
      groups.flatMap((group) => group.slots),
    );
    if (isAllSent) onClose();
  };

  return (
    <Subview overlay title='Answer all' onClose={requestClose}>
      <div className='space-y-6 pb-6'>
        <p className='text-muted-foreground text-sm'>
          Pick an option, add a note, or both. Each pull request gets your
          answers as one comment.
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
                <li key={slot.id}>
                  <AnswerFields
                    slot={slot}
                    draft={answers.getDraft(slot.id)}
                    isSent={answers.isSent(slot)}
                    error={answers.errors[slot.prNumber] ?? null}
                    onChoice={(choice) => answers.setChoice(slot.id, choice)}
                    onNote={(note) => answers.setNote(slot.id, note)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <SentLine sent={answers.lastSent} />
      </div>
      <ModalFooterActions
        note={
          answers.sendNote ? (
            <span className='text-destructive'>{answers.sendNote}</span>
          ) : undefined
        }
        rightActions={
          <Button
            type='button'
            variant='primary'
            disabled={readyCount === 0 || answers.isSending}
            onClick={() => void handleSend()}
          >
            {answers.isSending
              ? 'Sending…'
              : `Send ${readyCount} ${readyCount === 1 ? 'answer' : 'answers'}`}
          </Button>
        }
      />
    </Subview>
  );
}

export default AnswerAllSubview;
