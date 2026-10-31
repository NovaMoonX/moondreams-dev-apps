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
import { KIND_OPTIONS } from '@lib/feedback/feedbackDisplay';
import { sendFeedback } from '@lib/feedback/feedbackWrites';
import type { FeedbackContext, FeedbackKind } from '@lib/feedback/types';
import {
  needsMotionPermission,
  requestMotionPermission,
  setShakeOn,
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
  onShakeOff: () => void;
  onClose: () => void;
}

/** Text-only feedback to the people who run the site: a bug, an idea or a question, with where the person was attached and said so. */
function FeedbackSheet({
  isOpen,
  startKind,
  context,
  isShakeOn,
  onShakeEnabled,
  onShakeOff,
  onClose,
}: FeedbackSheetProps) {
  const { user, isAdmin } = useAuth();
  const { addToast } = useToast();
  const [kind, setKind] = useState<FeedbackKind>(startKind ?? 'bug');
  const [isPicking, setIsPicking] = useState(startKind === null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShakeDeclined, setIsShakeDeclined] = useState(false);
  const [isShakeTurnedOff, setIsShakeTurnedOff] = useState(false);

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
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const showsShakeTip = isShakeOn && isTouch;
  const showsShakeOffLine =
    !isShakeOn &&
    !isShakeDeclined &&
    (isShakeTurnedOff || (isTouch && !needsMotionPermission()));
  const showsShakeButton =
    needsMotionPermission() &&
    !isShakeOn &&
    !isShakeDeclined &&
    !showsShakeOffLine;

  const handleSend = async () => {
    if (!user || !canSend) return;
    setIsSending(true);
    setError(null);
    try {
      await sendFeedback({
        user,
        kind,
        text: text.trim(),
        context,
        isAdmin,
      });
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
    if (isGranted) {
      setShakeOn(true);
      onShakeEnabled();
      setIsShakeTurnedOff(false);
    }
    setIsShakeDeclined(!isGranted);
  };

  const handleTurnOffShake = () => {
    setShakeOn(false);
    onShakeOff();
    setIsShakeTurnedOff(true);
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
          <div className='space-y-2'>
            <h3 className='text-foreground text-sm font-medium'>What is it?</h3>
            <PillGroup
              label='What is it?'
              options={KIND_OPTIONS}
              value={kind}
              onChange={setKind}
            />
          </div>
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
          Goes to Nova, who runs these apps, with your name and email and where
          you were: the app, the screen and your device.
        </p>

        {showsShakeButton ? (
          <p className='text-muted-foreground text-xs'>
            <Button
              type='button'
              variant='base'
              size='sm'
              className='text-primary! h-auto p-0 font-normal underline'
              onClick={() => void handleTurnOnShake()}
            >
              Turn on shake to report
            </Button>{' '}
            Then shaking your phone anywhere opens this.
          </p>
        ) : null}
        {isShakeDeclined ? (
          <p className='text-muted-foreground text-xs'>
            Shake is off. To turn it on, allow Motion &amp; Orientation for this
            site in Safari&apos;s settings.
          </p>
        ) : null}
        {showsShakeOffLine ? (
          <p className='text-muted-foreground text-xs'>
            Shake is off.{' '}
            <Button
              type='button'
              variant='base'
              size='sm'
              className='text-primary! h-auto p-0 font-normal underline'
              onClick={() => void handleTurnOnShake()}
            >
              Turn on
            </Button>
          </p>
        ) : null}
        {showsShakeTip ? (
          <p className='text-muted-foreground text-xs'>
            Tip: shake your phone anywhere to report a bug.{' '}
            <Button
              type='button'
              variant='base'
              size='sm'
              className='text-primary! h-auto p-0 font-normal underline'
              onClick={handleTurnOffShake}
            >
              Turn off
            </Button>
          </p>
        ) : null}

        {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}

        <ModalFooterActions
          note={canSend ? undefined : 'Write something to send'}
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
