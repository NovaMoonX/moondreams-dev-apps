import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Keyboard, LayoutGrid, Mic } from 'lucide-react';

interface VoiceDockProps {
  onBrowse: () => void;
  onTalk: () => void;
  onType: () => void;
}

const SIDE_BUTTON =
  "relative size-12 min-w-12 rounded-full! p-0 before:absolute before:-inset-1 before:content-['']";

/** Home's dock: Browse, Talk and Type, fixed at the foot on a fade from the page colour. It is on home only. */
function VoiceDock({ onBrowse, onTalk, onType }: VoiceDockProps) {
  return (
    <nav
      aria-label='Talk, type or browse'
      className='from-background via-background/95 pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]'
    >
      <div className='pointer-events-auto mx-auto flex max-w-xl items-end justify-center gap-7'>
        <div className='flex w-14 flex-col items-center gap-1'>
          <Button
            type='button'
            variant='secondary'
            aria-label='Browse'
            className={SIDE_BUTTON}
            onClick={onBrowse}
          >
            <LayoutGrid className='size-5' aria-hidden='true' />
          </Button>
          <span className='text-muted-foreground text-[13px]'>Browse</span>
        </div>
        <div className='flex w-16 flex-col items-center gap-1'>
          <Button
            type='button'
            variant='primary'
            aria-label='Talk'
            className="relative size-[68px] min-w-[68px] rounded-full! p-0 before:absolute before:-inset-1 before:content-['']"
            onClick={onTalk}
          >
            <Mic className='size-7' aria-hidden='true' />
          </Button>
          <span className='text-[13px] font-medium'>Talk</span>
        </div>
        <div className='flex w-14 flex-col items-center gap-1'>
          <Button
            type='button'
            variant='secondary'
            aria-label='Type'
            className={SIDE_BUTTON}
            onClick={onType}
          >
            <Keyboard className='size-5' aria-hidden='true' />
          </Button>
          <span className='text-muted-foreground text-[13px]'>Type</span>
        </div>
      </div>
    </nav>
  );
}

export default VoiceDock;
