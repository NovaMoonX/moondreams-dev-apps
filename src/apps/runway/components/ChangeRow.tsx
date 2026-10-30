import { FileText, Undo2 } from 'lucide-react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import ActionChips from '@/components/ActionChips';
import { formatDateTime, formatDateUTC } from '@/utils/formatUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { CHANGE_KIND_LABELS, MOVE_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import type { OpenChange } from '@apps/runway/types';

interface ChangeRowProps {
  change: OpenChange;
  /** The confirmed income day this change shaped, when there is one. */
  confirmedDayKey: string | null;
  onOpenRecord: (dayKey: string) => void;
  /** The ids of moves of money that a later entry in the log took back. */
  undoneMoveIds?: ReadonlySet<string>;
}

/** One entry of the change log: when it was made, what it was, the day it starts from and the person's reason. */
function ChangeRow({
  change,
  confirmedDayKey,
  onOpenRecord,
  undoneMoveIds,
}: ChangeRowProps) {
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const undoMove = useUndoTransfer();
  const move = change.move !== null && !change.move.isUndo ? change.move : null;
  const isUndone = move !== null && (undoneMoveIds?.has(move.moveId) ?? false);
  const takeBack = async () => {
    if (move === null) return;
    const isConfirmed = await confirm({
      title: MOVE_WORDS.undoTitle,
      message: mask(`${move.undoText}.`),
      confirmText: MOVE_WORDS.undoThis,
    });
    if (isConfirmed) await undoMove(move);
  };
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
        <InlineNotice tone='info'>
          This entry could not be opened on this device.
        </InlineNotice>
      ) : (
        <p className='text-sm break-words'>
          <MaskedText>{change.summary}</MaskedText>
        </p>
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
      {isUndone && (
        <p className='text-muted-foreground text-sm'>{MOVE_WORDS.undoneRow}</p>
      )}
      {move !== null && !isUndone && (
        <ActionChips
          actions={[
            {
              key: 'undo',
              icon: <Undo2 className='h-4 w-4' />,
              label: MOVE_WORDS.undoThis,
              onClick: () => void takeBack(),
            },
          ]}
        />
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
