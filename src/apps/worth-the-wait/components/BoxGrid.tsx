import { BoxProvider } from '../context/BoxProvider';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import type { Box, BoxDraft } from '../types';
import BoxCard from './BoxCard';

interface BoxGridProps {
  boxes: Box[];
  onDeleteBox?: (boxId: string) => void | Promise<void>;
  onEditBox?: (boxId: string, draft: BoxDraft) => void | Promise<void>;
}

function BoxGrid({ boxes, onDeleteBox, onEditBox }: BoxGridProps) {
  const { space } = useWorthTheWait();

  if (boxes.length === 0) {
    return (
      <div className='border-border bg-muted/30 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground'>
        No boxes yet. Create the first one to get started.
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
      {boxes.map((box) => (
        <BoxProvider
          key={box.id}
          value={{
            box,
            spaceId: space?.id ?? '',
            onDelete: onDeleteBox,
            onEdit: onEditBox,
          }}
        >
          <BoxCard />
        </BoxProvider>
      ))}
    </div>
  );
}

export default BoxGrid;
