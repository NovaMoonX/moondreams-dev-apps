import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import { MEMORY_WORDS } from '@apps/runway/constants';
import { forgetMemory } from '@apps/runway/store/actions/memoryActions';

export interface MemoryRow {
  id: string;
  name: string;
}

interface MemoriesSheetProps {
  title: string;
  rows: readonly MemoryRow[];
  onClose: () => void;
}

/** What Runway remembers from the person's own confirmations, one row each; tapping a row asks to forget it. */
function MemoriesSheet({ title, rows, onClose }: MemoriesSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();

  const forget = async (row: MemoryRow) => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: MEMORY_WORDS.forgetTitle,
      message: MEMORY_WORDS.forgetMessage,
      confirmText: MEMORY_WORDS.forgetConfirm,
    });
    if (!isConfirmed) return;
    try {
      await forgetMemory(user.uid, row.id);
      addToast({ title: MEMORY_WORDS.forgotten, type: 'success' });
      if (rows.length === 1) onClose();
    } catch (error) {
      addToast({
        title: MEMORY_WORDS.failed,
        description: getErrorMessage(error, ''),
        type: 'error',
      });
    }
  };

  return (
    <DetailSheet isOpen onClose={onClose} title={title}>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {rows.map((row) => (
          <ItemRow
            key={row.id}
            name={row.name}
            detail={MEMORY_WORDS.rowDetail}
            ariaLabel={`${row.name}, ${MEMORY_WORDS.rowDetail}`}
            isAction
            onOpen={() => void forget(row)}
          />
        ))}
      </ul>
    </DetailSheet>
  );
}

export default MemoriesSheet;
