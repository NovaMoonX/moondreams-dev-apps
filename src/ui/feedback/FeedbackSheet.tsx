import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@hooks/useAuth';
import { useDiscardGuard } from '@hooks/useDiscardGuard';
import {
  getContextPlaceName,
  KIND_OPTIONS,
} from '@lib/feedback/feedbackDisplay';
import { sendFeedback } from '@lib/feedback/feedbackWrites';
import type { FeedbackContext, FeedbackKind } from '@lib/feedback/types';
import {
  needsMotionPermission,
  requestMotionPermission,
} from '@lib/motion/motionPermission';

const MAX_LENGTH = 2000;

const PROMPTS: Record<FeedbackKind, { label: string; placeholder: string }> = {
  bug: {
    label: 'What went wrong?',
    placeholder: 'Tell us what happened and what you expected instead.',
  },
  idea: {
    label: 'What would you like to see?',
    placeholder: 'Describe it however it comes to you.',
  },
  question: {
    label: "What's your question?",
    placeholder: 'Ask away. We read every one.',
  },
};

interface FeedbackSheetProps {
  isOpen: boolean;
  /** `null` starts on the kind picker; a kind starts on that kind with a way to switch. */
  startKind: FeedbackKind | null;
  context: FeedbackContext;
  isShakeOn: boolean;
  onShakeEnabled: () => void;
  onClose: () => void;
}

/** Text-only feedback to the people who run the site: a bug, an idea or a question, with where the person was attached and said so. */
function FeedbackSheet({
  isOpen,
  startKind,
  context,
  isShakeOn,
  onShakeEnabled,
  onClose,
}: FeedbackSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [kind, setKind] = useState<FeedbackKind>(startKind ?? 'bug');
  const [isPicking, setIsPicking] = useState(startKind === null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShakeDeclined, setIsShakeDeclined] = useState(false);

  const closeAndClear = () => {
    setText('');
    onClose();
  };
  const requestClose = useDiscardGuard({
    isDirty: text.trim().length > 0,
    onClose: closeAndClear,
    isBusy: isSending,
  });

  const canSend = text.trim().length > 0 && user !== null;
  const showsShakeButton = needsMotionPermission() && !isShakeOn;
  const showsShakeTip =
    isShakeOn && window.matchMedia('(pointer: coarse)').matches;

  const handleSend = async () => {
    if (!user || !canSend) return;
    setIsSending(true);
    setError(null);
    try {
      await sendFeedback({ user, kind, text: text.trim(), context });
      addToast({
        title: 'Thanks, we got it',
        description:
          "You'll see our reply under the bell at the top of the page.",
        type: 'success',
      });
      closeAndClear();
    } catch {
      setError(
        "We couldn't send that just now. What you wrote is still here, so check your connection and try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleTurnOnShake = async () => {
    const isGranted = await requestMotionPermission();
    if (isGranted) onShakeEnabled();
    setIsShakeDeclined(!isGranted);
  };

  const prompt = PROMPTS[kind];

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={isPicking ? 'Send feedback' : 'Report a bug'}
    >
      <div className='space-y-4'>
        {isPicking ? (
          <PillGroup
            label='What kind of feedback?'
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
          />
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            className='text-primary! h-auto justify-start p-0 text-left text-sm font-normal'
            onClick={() => setIsPicking(true)}
          >
            Something else? Send an idea or question instead
          </Button>
        )}

        <Field label={prompt.label}>
          {() => (
            <Textarea
              variant='outline'
              rows={5}
              maxLength={MAX_LENGTH}
              placeholder={prompt.placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>

        <p className='text-muted-foreground text-xs'>
          We&apos;ll include: {getContextPlaceName(context)} · this screen ·
          version {context.siteVersion} · your device
        </p>

        {showsShakeButton ? (
          <div className='space-y-1'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => void handleTurnOnShake()}
            >
              Turn on shake to report
            </Button>
            <p className='text-muted-foreground text-xs'>
              {isShakeDeclined
                ? 'No problem, shake stays off. You can still send feedback from the menu.'
                : 'Then shaking your phone anywhere opens this.'}
            </p>
          </div>
        ) : null}
        {showsShakeTip ? (
          <p className='text-muted-foreground text-xs'>
            Tip: shake your phone anywhere to report a bug.
          </p>
        ) : null}

        {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}

        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              disabled={isSending}
              onClick={requestClose}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              disabled={!canSend}
              loading={isSending}
              onClick={() => void handleSend()}
            >
              Send
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default FeedbackSheet;
