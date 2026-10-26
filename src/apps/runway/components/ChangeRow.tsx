import { FileText } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { formatDateTime, formatDateUTC } from '@/utils/formatUtils';
import { CHANGE_KIND_LABELS } from '@apps/runway/constants';
import type { OpenChange } from '@apps/runway/types';

interface ChangeRowProps {
  change: OpenChange;
  /** The confirmed income day this change shaped, when there is one. */
  confirmedDayKey: string | null;
  onOpenRecord: (dayKey: string) => void;
}

/** One entry of the change log: when it was made, what it was, the day it starts from and the person's reason. */
function ChangeRow({ change, confirmedDayKey, onOpenRecord }: ChangeRowProps) {
  return (
    <li className='space-y-1.5 p-3'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        {change.kind !== 'planChange' && (
          <span className='border-border bg-muted/50 text-muted-foreground inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap'>
            {CHANGE_KIND_LABELS[change.kind] ?? 'Change'}
          </span>
        )}
        <span className='text-muted-foreground text-xs'>
          {formatDateTime(change.createdAt)}
        </span>
      </div>
      {change.isUnreadable ? (
        <p className='text-muted-foreground text-sm'>
          This entry could not be opened on this device.
        </p>
      ) : (
        <p className='text-sm break-words'>{change.summary}</p>
      )}
      {change.effectiveFrom !== null && (
        <p className='text-muted-foreground text-sm'>
          Covers income days from {formatDateUTC(change.effectiveFrom)}
        </p>
      )}
      {change.note && (
        <p className='text-muted-foreground text-sm break-words'>
          Reason: {change.note}
        </p>
      )}
      {confirmedDayKey !== null && (
        <ActionChips
          actions={[
            {
              key: 'record',
              icon: <FileText className='h-4 w-4' />,
              label: 'Planned and confirmed',
              description: 'The first income day confirmed after this change',
              onClick: () => onOpenRecord(confirmedDayKey),
            },
          ]}
        />
      )}
    </li>
  );
}

export default ChangeRow;
