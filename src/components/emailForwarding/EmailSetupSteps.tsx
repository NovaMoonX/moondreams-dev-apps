import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  LoaderCircle,
} from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import EmailConfirmNotice from '@/components/emailForwarding/EmailConfirmNotice';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import type {
  EmailForwardingState,
  SetupProgress,
  SetupStepKey,
  StepState,
} from '@/lib/emailForwarding/setupProgress';

interface StepProps {
  number: number;
  title: string;
  state: StepState;
  isOpen: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

function Step({ number, title, state, isOpen, onToggle, children }: StepProps) {
  const panelId = `email-setup-step-${number}`;
  return (
    <li>
      <Button
        type='button'
        variant='base'
        className='flex h-auto min-h-11 w-full items-center justify-start gap-3 px-0! text-left whitespace-normal'
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span
          className={join(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            state === 'done' && 'bg-primary text-primary-foreground',
            state === 'current' && 'border-primary text-primary border-2',
            state === 'later' && 'bg-muted text-muted-foreground',
          )}
          aria-hidden='true'
        >
          {state === 'done' ? <Check className='size-4' /> : number}
        </span>
        <span
          className={join(
            'min-w-0 flex-1 text-sm font-semibold',
            state === 'later' && 'text-muted-foreground',
          )}
        >
          {title}
          {state === 'done' && (
            <span className='sr-only'>, {WORDS.stepDone}</span>
          )}
        </span>
        <ChevronDown
          className={join(
            'text-muted-foreground size-4 shrink-0',
            isOpen && 'rotate-180',
          )}
          aria-hidden='true'
        />
      </Button>
      {isOpen && (
        <div id={panelId} className='space-y-3 pb-2 pl-10'>
          {children}
        </div>
      )}
    </li>
  );
}

function StepLine({ children }: { children: ReactNode }) {
  return <p className='text-muted-foreground text-sm'>{children}</p>;
}

function UndoButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      className='relative before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""]'
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

interface EmailSetupStepsProps {
  appName: string;
  address: string;
  forwarding: EmailForwardingState;
  progress: SetupProgress;
  openStep: SetupStepKey | null;
  onOpenStep: (key: SetupStepKey | null) => void;
  onShowGuide: () => void;
  onUndoForward: () => void;
  onUndoSkip: () => void;
}

/** The setup as four general steps any email service fits: copy, forward, confirm if asked, first email. One is open at a time; the footer acts on the current one, and a finished step reopens with what happened and its Undo. */
function EmailSetupSteps({
  appName,
  address,
  forwarding,
  progress,
  openStep,
  onOpenStep,
  onShowGuide,
  onUndoForward,
  onUndoSkip,
}: EmailSetupStepsProps) {
  const { isTapped, onConfirmTapped, lastReceivedAt } = forwarding;
  const { states, shownConfirm, isForwardSeen, isConfirmSkipShown } = progress;
  const stepProps = (key: SetupStepKey) => ({
    state: states[key],
    isOpen: openStep === key,
    onToggle: () => onOpenStep(openStep === key ? null : key),
  });
  const guideRow = (
    <ActionRow
      icon={<CircleHelp />}
      label={WORDS.notSure}
      subtitle={WORDS.notSureSub}
      onClick={onShowGuide}
      hasChevron
    />
  );

  const confirmBody = () => {
    if (shownConfirm !== null) {
      return (
        <EmailConfirmNotice
          appName={appName}
          confirm={shownConfirm}
          isTapped={isTapped}
          onConfirmTapped={onConfirmTapped}
          isActionInFooter
        />
      );
    }
    if (isConfirmSkipShown) {
      return (
        <>
          <StepLine>{WORDS.stepConfirmSkipped}</StepLine>
          <UndoButton label={WORDS.undoSkip} onClick={onUndoSkip} />
        </>
      );
    }
    if (states.confirm === 'done') {
      return <StepLine>{WORDS.stepConfirmDone}</StepLine>;
    }
    return <StepLine>{WORDS.stepConfirmLine}</StepLine>;
  };

  const firstBody = () => {
    if (states.first === 'done') {
      return <EmailForwardingStatusLine lastReceivedAt={lastReceivedAt} />;
    }
    if (states.first === 'later') {
      return <StepLine>{WORDS.stepFirstLater}</StepLine>;
    }
    return (
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
    );
  };

  return (
    <div className='space-y-4'>
      <ol className='space-y-1'>
        <Step number={1} title={WORDS.stepCopy} {...stepProps('copy')}>
          {states.copy === 'done' ? (
            <>
              <StepLine>{WORDS.stepCopyDone}</StepLine>
              <CopyTextButton
                text={address}
                label={WORDS.copyAgain}
                variant='tertiary'
                isCompact
              />
            </>
          ) : (
            <StepLine>{WORDS.stepCopyLine}</StepLine>
          )}
        </Step>
        <Step number={2} title={WORDS.stepForward} {...stepProps('forward')}>
          {states.forward === 'done' && isForwardSeen && (
            <StepLine>{WORDS.stepForwardSeen}</StepLine>
          )}
          {states.forward === 'done' && !isForwardSeen && (
            <>
              <StepLine>{WORDS.stepForwardSaid}</StepLine>
              <UndoButton label={WORDS.undoForward} onClick={onUndoForward} />
            </>
          )}
          {states.forward !== 'done' && (
            <StepLine>{WORDS.stepForwardLine}</StepLine>
          )}
          {guideRow}
        </Step>
        <Step number={3} title={WORDS.stepConfirm} {...stepProps('confirm')}>
          {confirmBody()}
        </Step>
        <Step number={4} title={WORDS.stepFirst} {...stepProps('first')}>
          {firstBody()}
        </Step>
      </ol>
      {progress.isAllSet && (
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
