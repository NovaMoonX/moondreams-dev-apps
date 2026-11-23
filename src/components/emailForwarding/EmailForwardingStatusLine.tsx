import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/lib/emailForwarding/timeAgo';

interface EmailForwardingStatusLineProps {
  /** When any email last reached the address (`EmailIntakeState.lastReceivedAt`); null until one does. */
  lastReceivedAt: number | null;
}

/** "Working · last email 2 hours ago", or "No emails yet" while nothing has arrived. */
function EmailForwardingStatusLine({
  lastReceivedAt,
}: EmailForwardingStatusLineProps) {
  const now = useNow(60_000);
  return (
    <p className='text-sm font-medium' role='status'>
      {lastReceivedAt === null
        ? EMAIL_FORWARDING_WORDS.noEmailsYet
        : EMAIL_FORWARDING_WORDS.workingSince(
            formatTimeAgo(lastReceivedAt, now),
          )}
    </p>
  );
}

export default EmailForwardingStatusLine;
