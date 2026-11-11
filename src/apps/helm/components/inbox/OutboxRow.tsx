import { Lock } from 'lucide-react';

import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  getOutboxWords,
  type OutboxEntry,
} from '@apps/helm/store/actions/outboxActions';

/** A thing saved on this device with no connection: its words only in the session that typed them, otherwise its time. */
export function OutboxRow({ entry }: { entry: OutboxEntry }) {
  const words = getOutboxWords(entry.id);
  return (
    <li className='flex items-center gap-3 px-4 py-3'>
      <Lock
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 text-[15px] leading-[21px] break-words'>
          {words === null ? HELM_COPY.outboxRowTitle : `“${words}”`}
        </span>
        <span className='text-muted-foreground block text-[13px] tabular-nums'>
          {HELM_COPY.outboxRowLine(formatTime(entry.createdAt))}
        </span>
      </span>
    </li>
  );
}

/** Every thing saved on this device, under its count; nothing when there are none. */
function OutboxList({ entries }: { entries: OutboxEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className='space-y-2'>
      <h2 className='text-muted-foreground text-[13px]'>
        {HELM_COPY.outboxCount(entries.length)}
      </h2>
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {entries.map((entry) => (
          <OutboxRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

export default OutboxList;
