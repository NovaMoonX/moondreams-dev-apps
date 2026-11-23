import { join } from '@moondreamsdev/dreamer-ui/utils';

import CopyTextButton from '@/components/CopyTextButton';
import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { splitAddress } from '@/lib/emailForwarding/filterText';

interface EmailAddressTextProps {
  address: string;
  className?: string;
}

/** An address that may break only after its `@`, so the domain stays whole at 320px; selects in one tap. */
export function EmailAddressText({
  address,
  className,
}: EmailAddressTextProps) {
  const { local, domain } = splitAddress(address);
  return (
    <p className={join('select-all', className)}>
      <span className='break-all'>{local}</span>
      <wbr />
      <span className='whitespace-nowrap'>{domain}</span>
    </p>
  );
}

interface EmailAddressRowProps {
  address: string;
}

/** The forwarding address as a quiet bordered row with Copy beside it, for a screen that shows it once forwarding works. */
function EmailAddressRow({ address }: EmailAddressRowProps) {
  return (
    <div className='border-border flex items-center justify-between gap-3 rounded-2xl border p-3'>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-xs'>
          {EMAIL_FORWARDING_WORDS.addressRow}
        </p>
        <EmailAddressText address={address} className='text-sm' />
      </div>
      <CopyTextButton
        text={address}
        label={EMAIL_FORWARDING_WORDS.copy}
        variant='tertiary'
        isCompact
      />
    </div>
  );
}

export default EmailAddressRow;
