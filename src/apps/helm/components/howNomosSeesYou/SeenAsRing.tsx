import { join } from '@moondreamsdev/dreamer-ui/utils';

import SourceRing from '@apps/helm/components/who/SourceRing';
import { SEEN_AS_WORDS } from '@apps/helm/components/howNomosSeesYou/seenAsWords';

interface SeenAsRingProps {
  isCorrected: boolean;
  assistant: string;
  /** Sits centred in a caption line, with no drop to meet a first text line. */
  isInline?: boolean;
}

/** The ring beside a line: filled when the person said it, hollow when the assistant noticed it. */
function SeenAsRing({ isCorrected, assistant, isInline }: SeenAsRingProps) {
  return (
    <SourceRing
      isConfirmed={isCorrected}
      label={
        isCorrected
          ? SEEN_AS_WORDS.ringSaid
          : SEEN_AS_WORDS.ringNoticed(assistant)
      }
      className={join(!isInline && 'mt-1.5')}
    />
  );
}

export default SeenAsRing;
