import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';

interface EmailSetupViewProps {
  address: string | null;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  onGetAddress: () => void;
  onDone: () => void;
}

/** The whole setup: the private address to copy and one line on what to forward. */
function EmailSetupView({
  address,
  isLoading,
  isBusy,
  error,
  onGetAddress,
  onDone,
}: EmailSetupViewProps) {
  const [name, ...host] = (address ?? '').split('@');
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>{EMAIL_WORDS.setupLine}</p>
      {address === null ? (
        <Button
          className='w-full'
          disabled={isBusy || isLoading}
          onClick={onGetAddress}
        >
          {EMAIL_WORDS.getAddress}
        </Button>
      ) : (
        <div className='border-border space-y-3 rounded-2xl border p-3'>
          <p className='text-base font-semibold select-all'>
            <span className='break-all'>{name}@</span>
            <wbr />
            <span className='whitespace-nowrap'>{host.join('@')}</span>
          </p>
          <CopyTextButton
            text={address}
            label={EMAIL_WORDS.copyAddress}
            variant='secondary'
          />
        </div>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      {address !== null && (
        <Button className='w-full' onClick={onDone}>
          {EMAIL_WORDS.done}
        </Button>
      )}
    </div>
  );
}

export default EmailSetupView;
