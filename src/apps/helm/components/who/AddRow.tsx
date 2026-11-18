import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

interface AddRowProps {
  label: string;
  onClick: () => void;
}

/** What a section with nothing in it shows instead of a heading and a sentence: one quiet row that adds the first. */
function AddRow({ label, onClick }: AddRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='helm-card text-muted-foreground flex h-auto min-h-10 w-full min-w-0 items-center justify-start gap-2 px-4 py-2.5 text-left text-[15px] font-normal'
      onClick={onClick}
    >
      <Plus className='size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 break-words'>{label}</span>
    </Button>
  );
}

export default AddRow;
