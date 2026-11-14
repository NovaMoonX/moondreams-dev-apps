import { Fragment, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import Drawer from '@/components/Drawer';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { HELM_COPY } from '@apps/helm/constants';
import type { SwappedWords } from '@apps/helm/utils/spokenNames';

const SWAP =
  "relative inline-flex h-auto min-h-0 items-baseline p-0 text-[length:inherit] leading-[inherit] font-[inherit] underline decoration-muted-foreground decoration-[1.5px] decoration-dotted underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']";

interface HeardWordsProps {
  text: string;
  swaps: SwappedWords['swaps'];
  /** Puts the word back as it was heard. */
  onRestore: (heard: string) => void;
}

/** The words as heard, each name that stands in for what was heard drawn with a dotted underline; a tap shows what was heard and offers to keep it. */
function HeardWords({ text, swaps, onRestore }: HeardWordsProps) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const open = openAt === null ? undefined : swaps[openAt];
  const { dialogId, onDialogClose } = useSheetHistory(open !== undefined, () =>
    setOpenAt(null),
  );

  return (
    <>
      {swaps.map((swap, at) => (
        <Fragment key={swap.start}>
          {text.slice(at === 0 ? 0 : swaps[at - 1].end, swap.start)}
          <Button
            type='button'
            variant='base'
            className={SWAP}
            aria-label={HELM_COPY.heardAsTapLabel(swap.name, swap.heard)}
            onClick={() => setOpenAt(at)}
          >
            {swap.name}
          </Button>
        </Fragment>
      ))}
      {text.slice(swaps.length === 0 ? 0 : swaps[swaps.length - 1].end)}
      <Drawer
        id={dialogId}
        isOpen={open !== undefined}
        onClose={onDialogClose}
        title={open ? HELM_COPY.heardAsTitle(open.heard) : ''}
      >
        {open && (
          <div className='flex flex-col gap-3 pb-4'>
            <p className='text-muted-foreground text-[13px]'>
              {HELM_COPY.heardAsShownAs(open.name)}
            </p>
            <Button
              type='button'
              variant='secondary'
              className='h-11 w-full'
              onClick={() => {
                onRestore(open.heard);
                onDialogClose();
              }}
            >
              {HELM_COPY.heardAsUse}
            </Button>
            <Button
              type='button'
              variant='tertiary'
              className='w-full'
              onClick={onDialogClose}
            >
              {HELM_COPY.heardAsKeep(open.name)}
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default HeardWords;
