import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Lock } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import SeenAsRing from '@apps/helm/components/howNomosSeesYou/SeenAsRing';
import {
  SEEN_AS_WORDS,
  toNoticedDay,
} from '@apps/helm/components/howNomosSeesYou/seenAsWords';
import type { OpenSeenAs } from '@apps/helm/store/listeners/seenAsListener';

interface SeenAsRowProps {
  line: OpenSeenAs;
  assistant: string;
  onOpen: (id: string) => void;
}

/** One line of how the assistant sees the person: its ring, the words (the person's own once corrected) and where it came from. Opens the line. */
function SeenAsRow({ line, assistant, onOpen }: SeenAsRowProps) {
  const isCorrected = line.state === 'corrected';
  const basis = isCorrected
    ? SEEN_AS_WORDS.rowSaid(
        toNoticedDay(line.correctedAt ?? line.derivedAt),
        assistant,
      )
    : line.basis;
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(line.id)}
    >
      <SeenAsRing isCorrected={isCorrected} assistant={assistant} />
      <span className='min-w-0 flex-1'>
        <span className='flex min-w-0 items-start gap-1'>
          <span className='text-foreground line-clamp-2 min-w-0 text-[15px] leading-[21px] font-medium break-words'>
            {line.corrected ?? line.line}
          </span>
          {line.privacy === 'private' && (
            <Lock
              className='text-muted-foreground mt-[3.5px] size-3.5 shrink-0'
              role='img'
              aria-label={HELM_COPY.privateLockLabel}
            />
          )}
        </span>
        {basis !== '' && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {basis}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default SeenAsRow;
