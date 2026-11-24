import { LoaderCircle } from 'lucide-react';

import EmailConfirmNotice from '@/components/emailForwarding/EmailConfirmNotice';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { hasConfirmNotice } from '@/lib/emailForwarding/address';
import type { EmailConfirm } from '@/lib/emailForwarding/types';

interface EmailForwardingProgressProps {
  appName: string;
  /** The confirmation the caller would show now, or null. */
  confirm: EmailConfirm | null;
  isTapped: boolean;
  onConfirmTapped: () => void;
  lastReceivedAt: number | null;
}

/** Where forwarding stands, live from the listener: waiting, a confirmation to act on or accepted, or working. */
function EmailForwardingProgress({
  appName,
  confirm,
  isTapped,
  onConfirmTapped,
  lastReceivedAt,
}: EmailForwardingProgressProps) {
  if (confirm !== null && hasConfirmNotice(confirm)) {
    return (
      <EmailConfirmNotice
        appName={appName}
        confirm={confirm}
        isTapped={isTapped}
        onConfirmTapped={onConfirmTapped}
      />
    );
  }
  if (lastReceivedAt !== null) {
    return <EmailForwardingStatusLine lastReceivedAt={lastReceivedAt} />;
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
}

export default EmailForwardingProgress;
