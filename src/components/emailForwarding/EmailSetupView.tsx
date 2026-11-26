import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { hasConfirmNotice } from '@/lib/emailForwarding/address';
import EmailAddressText from '@/components/emailForwarding/EmailAddressText';
import EmailProviderGuide, {
  type EmailFilterSuggestion,
} from '@/components/emailForwarding/EmailProviderGuide';
import EmailSetupSteps, {
  type EmailForwardingState,
} from '@/components/emailForwarding/EmailSetupSteps';
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

/** The whole forwarding setup on one screen: the ask, the address, Copy address as its one act, then what to do in their email. */
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
  const [isCopyFailed, setIsCopyFailed] = useState(false);
  const [guideOpenedAt, setGuideOpenedAt] = useState<{
    confirmAt: number | null;
  } | null>(null);
  const isGuideOpen =
    guideOpenedAt !== null && guideOpenedAt.confirmAt === forwarding.confirmAt;
  const isConfirmPending =
    forwarding.confirm !== null &&
    hasConfirmNotice(forwarding.confirm) &&
    forwarding.confirm.autoConfirm !== 'confirmed';
  const isCopied = address !== null && copiedAddress === address;
  const isSetUp =
    isCopied ||
    forwarding.confirmAt !== null ||
    forwarding.lastReceivedAt !== null;

  const copyAddress = async () => {
    if (address === null) return;
    const didCopy = await copyToClipboard(address);
    setIsCopyFailed(!didCopy);
    setCopiedAddress(didCopy ? address : null);
  };

  const footerButton = () => {
    if (address !== null) {
      return (
        <Button
          type='button'
          variant={isSetUp && isConfirmPending ? 'secondary' : undefined}
          onClick={isSetUp ? onDone : () => void copyAddress()}
        >
          {isSetUp ? WORDS.done : WORDS.copyAddress}
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
          forwarding={forwarding}
          isCopied={isCopied}
          onShowGuide={() =>
            setGuideOpenedAt({ confirmAt: forwarding.confirmAt })
          }
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
      {isCopyFailed && (
        <p className='text-destructive text-sm' role='alert'>
          {WORDS.copyFailed}
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
