import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

interface AddRowProps {
  label: string;
  onClick: () => void;
  /** The last row of a list's card, where a list with items keeps its add, rather than a card of its own. */
  isInList?: boolean;
}

/** One quiet row that adds: alone where a section has nothing yet, or as the last row of its list. */
function AddRow({ label, onClick, isInList = false }: AddRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'text-muted-foreground flex h-auto w-full min-w-0 items-center justify-start gap-2 px-4 text-left text-[15px] font-normal',
        isInList
          ? 'min-h-12 rounded-none border-0 py-3 focus-visible:-outline-offset-2'
          : 'helm-card min-h-10 py-2.5',
      )}
      onClick={onClick}
    >
      <Plus className='size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 break-words'>{label}</span>
    </Button>
  );
}

export default AddRow;
