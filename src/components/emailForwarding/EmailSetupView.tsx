import { type ReactNode, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { copyToClipboard } from '@/utils/clipboardUtils';
import EmailAddressText from '@/components/emailForwarding/EmailAddressText';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';

/** A mail search an app suggests for forwarding only its emails. */
export interface EmailFilterSuggestion {
  sender: string;
  phrase: string;
}

const toGmailSearch = ({ sender, phrase }: EmailFilterSuggestion) =>
  `from:(${sender}) "${phrase}"`;

interface EmailSetupViewProps {
  /** What to forward and what the app does with it, in one line. */
  setupLine: string;
  /** The address's local part before the token. */
  prefix: string;
  address: string | null;
  isLoading: boolean;
  isFailed: boolean;
  isBusy: boolean;
  error: string | null;
  /** Where forwarding stands, shown under the address so a confirmation lands without leaving setup. */
  progress?: ReactNode;
  /** Shown once there is an address, as a starting point for the person's own filter. */
  filter?: EmailFilterSuggestion | null;
  onGetAddress: () => void;
  onRetry: () => void;
  onDone: () => void;
}

/** The whole forwarding setup on one screen: the ask, the address, and Copy address as its one act. */
function EmailSetupView({
  setupLine,
  prefix,
  address,
  isLoading,
  isFailed,
  isBusy,
  error,
  progress = null,
  filter = null,
  onGetAddress,
  onRetry,
  onDone,
}: EmailSetupViewProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isCopyFailed, setIsCopyFailed] = useState(false);
  const [isSearchCopyFailed, setIsSearchCopyFailed] = useState(false);

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
          {isCopied ? WORDS.done : WORDS.copyAddress}
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
      {address !== null && progress}
      {address !== null && filter !== null && (
        <div className='bg-muted/40 space-y-2 rounded-2xl p-3'>
          <p className='text-sm font-semibold'>{WORDS.filterTitle}</p>
          <p className='text-muted-foreground text-sm break-words'>
            {WORDS.filterLine(filter.sender, filter.phrase)}
          </p>
          <code className='bg-background border-border block rounded-xl border px-2.5 py-2 text-xs break-words select-all'>
            {toGmailSearch(filter)}
          </code>
          <div className='flex justify-end'>
            <CopyTextButton
              isCompact
              variant='secondary'
              text={toGmailSearch(filter)}
              label={WORDS.copySearch}
              onFailed={() => setIsSearchCopyFailed(true)}
            />
          </div>
          {isSearchCopyFailed && (
            <p className='text-destructive text-sm' role='alert'>
              {WORDS.searchCopyFailed}
            </p>
          )}
          <p className='text-muted-foreground text-xs'>{WORDS.filterCheck}</p>
        </div>
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
