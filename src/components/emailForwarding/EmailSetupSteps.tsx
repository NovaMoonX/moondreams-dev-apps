import { type ReactNode, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, CircleHelp, LoaderCircle, CircleCheck } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import InlineNotice from '@/components/InlineNotice';
import SkipQuestionButton from '@/components/SkipQuestionButton';
import EmailConfirmNotice from '@/components/emailForwarding/EmailConfirmNotice';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { hasConfirmNotice } from '@/lib/emailForwarding/address';
import type { EmailConfirm } from '@/lib/emailForwarding/types';

/** Where forwarding stands, live from the app's listener. */
export interface EmailForwardingState {
  /** The confirmation still worth showing, or null once it is settled or none came. */
  confirm: EmailConfirm | null;
  /** When the newest confirmation arrived, shown or not, so its own email never counts as the first one. */
  confirmAt: number | null;
  isTapped: boolean;
  onConfirmTapped: () => void;
  lastReceivedAt: number | null;
}

type StepState = 'done' | 'current' | 'later';

interface StepProps {
  number: number;
  title: string;
  state: StepState;
  children?: ReactNode;
}

function Step({ number, title, state, children }: StepProps) {
  return (
    <li className='flex gap-3'>
      <span
        className={join(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          state === 'done' && 'bg-primary text-primary-foreground',
          state === 'current' && 'border-primary text-primary border-2',
          state === 'later' && 'bg-muted text-muted-foreground',
        )}
        aria-hidden='true'
      >
        {state === 'done' ? <Check className='size-3.5' /> : number}
      </span>
      <div className='min-w-0 flex-1 space-y-2 pt-0.5'>
        <p
          className={join(
            'text-sm font-semibold',
            state === 'later' && 'text-muted-foreground',
          )}
        >
          {title}
          {state === 'done' && (
            <span className='sr-only'>, {WORDS.stepDone}</span>
          )}
        </p>
        {children}
      </div>
    </li>
  );
}

interface EmailSetupStepsProps {
  appName: string;
  forwarding: EmailForwardingState;
  isCopied: boolean;
  onShowGuide: () => void;
}

/** The setup as four general steps any email service fits: copy, forward, confirm if asked, first email; each ticks itself from what the app sees, or on the person's word. */
function EmailSetupSteps({
  appName,
  forwarding,
  isCopied,
  onShowGuide,
}: EmailSetupStepsProps) {
  const { confirm, confirmAt, isTapped, onConfirmTapped, lastReceivedAt } =
    forwarding;
  const [isForwardSaid, setIsForwardSaid] = useState(false);
  const [isConfirmSkipped, setIsConfirmSkipped] = useState(false);
  const shownConfirm =
    confirm !== null && hasConfirmNotice(confirm) ? confirm : null;
  const isConfirmPending =
    shownConfirm !== null && shownConfirm.autoConfirm !== 'confirmed';
  const hasFirstEmail =
    lastReceivedAt !== null &&
    (confirmAt === null || lastReceivedAt > confirmAt);
  const isForwarding =
    confirmAt !== null || lastReceivedAt !== null || isForwardSaid;
  const isConfirmSettled =
    shownConfirm === null
      ? hasFirstEmail || isConfirmSkipped || confirmAt !== null
      : !isConfirmPending;
  const isAllSet = hasFirstEmail && !isConfirmPending;

  const stateOf = (isDone: boolean, isCurrent: boolean): StepState => {
    if (isDone) return 'done';
    return isCurrent ? 'current' : 'later';
  };
  const copyState = stateOf(isCopied || isForwarding, true);
  const forwardState = stateOf(isForwarding, copyState === 'done');
  const confirmState = stateOf(isConfirmSettled, forwardState === 'done');
  const firstState = stateOf(isAllSet, confirmState === 'done');

  return (
    <div className='space-y-4'>
      <ol className='space-y-4'>
        <Step number={1} title={WORDS.stepCopy} state={copyState} />
        <Step number={2} title={WORDS.stepForward} state={forwardState}>
          {forwardState === 'current' && (
            <>
              <p className='text-muted-foreground text-sm'>
                {WORDS.stepForwardLine}
              </p>
              <ActionRow
                icon={<CircleHelp />}
                label={WORDS.notSure}
                subtitle={WORDS.notSureSub}
                onClick={onShowGuide}
                hasChevron
              />
              <Button
                type='button'
                variant='secondary'
                className='!mt-4 w-full'
                onClick={() => setIsForwardSaid(true)}
              >
                {WORDS.forwardOnButton}
              </Button>
            </>
          )}
        </Step>
        <Step number={3} title={WORDS.stepConfirm} state={confirmState}>
          {shownConfirm !== null && (
            <EmailConfirmNotice
              appName={appName}
              confirm={shownConfirm}
              isTapped={isTapped}
              onConfirmTapped={onConfirmTapped}
            />
          )}
          {shownConfirm === null && (hasFirstEmail || confirmAt !== null) && (
            <p className='text-muted-foreground text-sm'>
              {WORDS.stepConfirmDone}
            </p>
          )}
          {shownConfirm === null &&
            !hasFirstEmail &&
            confirmAt === null &&
            confirmState !== 'later' && (
              <>
                {!isConfirmSkipped && (
                  <p className='text-muted-foreground text-sm'>
                    {WORDS.stepConfirmLine}
                  </p>
                )}
                <SkipQuestionButton
                  label={WORDS.skipConfirm}
                  skippedLabel={WORDS.skippedConfirm}
                  note={WORDS.skipConfirmNote}
                  skippedNote={WORDS.stepConfirmSkipped}
                  isSkipped={isConfirmSkipped}
                  onSkip={() => setIsConfirmSkipped((was) => !was)}
                />
              </>
            )}
        </Step>
        <Step number={4} title={WORDS.stepFirst} state={firstState}>
          {firstState === 'done' && (
            <EmailForwardingStatusLine lastReceivedAt={lastReceivedAt} />
          )}
          {firstState === 'current' && (
            <p
              className='text-muted-foreground flex items-start gap-2 text-sm'
              role='status'
            >
              <LoaderCircle
                className='mt-0.5 size-4 shrink-0 motion-safe:animate-spin motion-reduce:hidden'
                aria-hidden='true'
              />
              {WORDS.waitingForFirst}
            </p>
          )}
        </Step>
      </ol>
      {isAllSet && (
        <InlineNotice
          tone='success'
          icon={CircleCheck}
          title={WORDS.allSetTitle}
        >
          {WORDS.allSetLine}
        </InlineNotice>
      )}
    </div>
  );
}

export default EmailSetupSteps;
