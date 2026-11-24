import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { copyToClipboard } from '@/utils/clipboardUtils';
import EmailAddressText from '@apps/runway/components/EmailAddressText';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';

interface EmailSetupViewProps {
  address: string | null;
  isLoading: boolean;
  isFailed: boolean;
  isBusy: boolean;
  error: string | null;
  onGetAddress: () => void;
  onRetry: () => void;
  onDone: () => void;
}

function EmailSetupView({
  address,
  isLoading,
  isFailed,
  isBusy,
  error,
  onGetAddress,
  onRetry,
  onDone,
}: EmailSetupViewProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isCopyFailed, setIsCopyFailed] = useState(false);

  const copyAddress = async () => {
    if (address === null) return;
    const didCopy = await copyToClipboard(address);
    setIsCopyFailed(!didCopy);
    setCopiedAddress(didCopy ? address : null);
  };

  const footerButton = () => {
    if (address !== null) {
      const isCopied = copiedAddress === address;
      return (
        <Button
          type='button'
          onClick={isCopied ? onDone : () => void copyAddress()}
        >
          {isCopied ? EMAIL_WORDS.done : EMAIL_WORDS.copyAddress}
        </Button>
      );
    }
    if (isFailed) {
      return (
        <Button type='button' onClick={onRetry}>
          {EMAIL_WORDS.tryAgain}
        </Button>
      );
    }
    return (
      <Button
        type='button'
        disabled={isBusy || isLoading}
        onClick={onGetAddress}
      >
        {EMAIL_WORDS.getAddress}
      </Button>
    );
  };

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>{EMAIL_WORDS.setupLine}</p>
      {address !== null && (
        <p className='border-border rounded-2xl border p-3 text-sm font-semibold select-all max-[359px]:p-2.5 max-[359px]:text-xs max-[359px]:tracking-tight'>
          <EmailAddressText address={address} />
        </p>
      )}
      {address === null && isFailed && (
        <p className='text-destructive text-sm' role='alert'>
          {EMAIL_WORDS.addressLoadFailed}
        </p>
      )}
      {isCopyFailed && (
        <p className='text-destructive text-sm' role='alert'>
          {EMAIL_WORDS.copyFailed}
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
