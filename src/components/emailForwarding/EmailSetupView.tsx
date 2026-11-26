import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { copyToClipboard } from '@/utils/clipboardUtils';
import {
  CONFIRM_PROVIDER_NAMES,
  readConfirmLink,
} from '@/lib/emailForwarding/address';
import EmailAddressText from '@/components/emailForwarding/EmailAddressText';
import EmailProviderGuide, {
  type EmailFilterSuggestion,
} from '@/components/emailForwarding/EmailProviderGuide';
import EmailSetupSteps from '@/components/emailForwarding/EmailSetupSteps';
import {
  type EmailForwardingState,
  readSetupProgress,
  type SetupStepKey,
} from '@/lib/emailForwarding/setupProgress';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';

export type { EmailFilterSuggestion };

interface EmailSetupViewProps {
  /** Names the app where a step says who accepts a confirmation. */
  appName: string;
  /** What to forward and what the app does with it, in one line. */
  setupLine: string;
  /** The address's local part before the token. */
  prefix: string;
  address: string | null;
  isLoading: boolean;
  isFailed: boolean;
  isBusy: boolean;
  error: string | null;
  /** Where forwarding stands, live, so each step ticks itself and a confirmation lands without leaving setup. */
  forwarding: EmailForwardingState;
  /** The search for only this app's emails, offered in the help once the person asks how. */
  filter?: EmailFilterSuggestion | null;
  onGetAddress: () => void;
  onRetry: () => void;
  onDone: () => void;
}

interface OpenedStep {
  key: SetupStepKey | null;
  /** The person's pick holds only until the setup moves on or a confirmation arrives; then the step to act on opens. */
  whileCurrent: SetupStepKey | null;
  confirmAt: number | null;
}

/** The whole forwarding setup on one screen: the ask, the address, then four steps whose current one is the footer's single action. */
function EmailSetupView({
  appName,
  setupLine,
  prefix,
  address,
  isLoading,
  isFailed,
  isBusy,
  error,
  forwarding,
  filter = null,
  onGetAddress,
  onRetry,
  onDone,
}: EmailSetupViewProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedCodeAt, setCopiedCodeAt] = useState<number | null>(null);
  const [copyFailure, setCopyFailure] = useState<string | null>(null);
  const [isForwardSaid, setIsForwardSaid] = useState(false);
  const [isConfirmSkipped, setIsConfirmSkipped] = useState(false);
  const [openedStep, setOpenedStep] = useState<OpenedStep | null>(null);
  const [guideOpenedAt, setGuideOpenedAt] = useState<{
    confirmAt: number | null;
  } | null>(null);
  const isGuideOpen =
    guideOpenedAt !== null && guideOpenedAt.confirmAt === forwarding.confirmAt;
  const isCopied = address !== null && copiedAddress === address;
  const progress = readSetupProgress({
    forwarding,
    isCopied,
    isForwardSaid,
    isConfirmSkipped,
  });
  const openStep =
    openedStep !== null &&
    openedStep.whileCurrent === progress.current &&
    openedStep.confirmAt === forwarding.confirmAt
      ? openedStep.key
      : progress.current;

  const copyText = async (text: string, failure: string) => {
    const didCopy = await copyToClipboard(text);
    setCopyFailure(didCopy ? null : failure);
    return didCopy;
  };

  const copyAddress = async () => {
    if (address === null) return;
    const didCopy = await copyText(address, WORDS.copyFailed);
    setCopiedAddress(didCopy ? address : null);
  };

  const copyCode = async (code: string) => {
    const didCopy = await copyText(code, WORDS.codeCopyFailed);
    setCopiedCodeAt(didCopy ? forwarding.confirmAt : null);
  };

  const confirmAction = () => {
    const pending = progress.pendingConfirm;
    if (pending === null) {
      return {
        label: WORDS.skipConfirm,
        onClick: () => setIsConfirmSkipped(true),
      };
    }
    const url = readConfirmLink(pending);
    const name =
      pending.provider === null
        ? null
        : CONFIRM_PROVIDER_NAMES[pending.provider];
    if (url !== null && !forwarding.isTapped) {
      return {
        label: WORDS.confirmButton(name),
        onClick: () => {
          window.open(url, '_blank', 'noopener,noreferrer');
          forwarding.onConfirmTapped();
        },
      };
    }
    if (
      url === null &&
      pending.code !== null &&
      (copiedCodeAt === null || copiedCodeAt !== forwarding.confirmAt)
    ) {
      const code = pending.code;
      return { label: WORDS.copyCode, onClick: () => void copyCode(code) };
    }
    return { label: WORDS.done, onClick: onDone };
  };

  const stepAction = () => {
    if (progress.current === 'copy') {
      return { label: WORDS.copyAddress, onClick: () => void copyAddress() };
    }
    if (progress.current === 'forward') {
      return {
        label: WORDS.forwardOnButton,
        onClick: () => setIsForwardSaid(true),
      };
    }
    if (progress.current === 'confirm') return confirmAction();
    return { label: WORDS.done, onClick: onDone };
  };

  const footerButton = () => {
    if (address !== null) {
      const action = stepAction();
      return (
        <Button type='button' onClick={action.onClick}>
          {action.label}
        </Button>
      );
    }
    if (isFailed) {
      return (
        <Button type='button' onClick={onRetry}>
          {WORDS.tryAgain}
        </Button>
      );
    }
    return (
      <Button
        type='button'
        disabled={isBusy || isLoading}
        onClick={onGetAddress}
      >
        {WORDS.getAddress}
      </Button>
    );
  };

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>{setupLine}</p>
      {address !== null && (
        <p className='border-border rounded-2xl border p-3 text-sm font-semibold select-all max-[359px]:p-2.5 max-[359px]:text-xs max-[359px]:tracking-tight'>
          <EmailAddressText address={address} prefix={prefix} />
        </p>
      )}
      {address !== null && (
        <EmailSetupSteps
          appName={appName}
          address={address}
          forwarding={forwarding}
          progress={progress}
          openStep={openStep}
          onOpenStep={(key) =>
            setOpenedStep({
              key,
              whileCurrent: progress.current,
              confirmAt: forwarding.confirmAt,
            })
          }
          onShowGuide={() =>
            setGuideOpenedAt({ confirmAt: forwarding.confirmAt })
          }
          onUndoForward={() => {
            setIsForwardSaid(false);
            setIsConfirmSkipped(false);
          }}
          onUndoSkip={() => setIsConfirmSkipped(false)}
        />
      )}
      {address !== null && (
        <EmailProviderGuide
          isOpen={isGuideOpen}
          onClose={() => setGuideOpenedAt(null)}
          address={address}
          prefix={prefix}
          filter={filter}
        />
      )}
      {address === null && isFailed && (
        <p className='text-destructive text-sm' role='alert'>
          {WORDS.addressLoadFailed}
        </p>
      )}
      {copyFailure !== null && (
        <p className='text-destructive text-sm' role='alert'>
          {copyFailure}
        </p>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      <ModalFooterActions rightActions={footerButton()} />
    </div>
  );
}

export default EmailSetupView;
