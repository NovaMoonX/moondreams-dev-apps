import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CookingPot } from 'lucide-react';

interface StartCookingRowProps {
  onClick: () => void;
}

function StartCookingRow({ onClick }: StartCookingRowProps) {
  return (
    <div className='bg-muted/50 border-border overflow-hidden rounded-2xl border'>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-12 w-full justify-start gap-3 rounded-none py-2 text-left'
        onClick={onClick}
      >
        <span className='w-5 shrink-0' aria-hidden='true'>
          <CookingPot className='h-4 w-4' />
        </span>
        <span className='min-w-0 text-left'>
          <span className='block'>Start cooking</span>
          <span className='text-muted-foreground block text-xs font-normal'>
            Steps one at a time, with a timer
          </span>
        </span>
      </Button>
    </div>
  );
}

export default StartCookingRow;
