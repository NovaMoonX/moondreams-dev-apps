import { join } from '@moondreamsdev/dreamer-ui/utils';

import SourceRing from '@apps/helm/components/who/SourceRing';
import { SEEN_AS_WORDS } from '@apps/helm/components/howNomosSeesYou/seenAsWords';

interface SeenAsRingProps {
  isCorrected: boolean;
  assistant: string;
  className?: string;
}

/** The ring beside a line: filled when the person said it, hollow when the assistant noticed it. */
function SeenAsRing({ isCorrected, assistant, className }: SeenAsRingProps) {
  return (
    <SourceRing
      isConfirmed={isCorrected}
      label={
        isCorrected
          ? SEEN_AS_WORDS.ringSaid
          : SEEN_AS_WORDS.ringNoticed(assistant)
      }
      className={join('mt-1.5', className)}
    />
  );
}

export default SeenAsRing;
