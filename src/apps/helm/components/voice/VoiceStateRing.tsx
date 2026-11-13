import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { VoiceState } from '@/hooks/useVoiceConversation';

interface VoiceStateRingProps {
  state: VoiceState;
  children: ReactNode;
}

const RING: Record<Exclude<VoiceState, 'idle'>, string> = {
  listening: 'border-primary/60 motion-safe:animate-pulse',
  thinking: 'border-primary/20 border-t-primary motion-safe:animate-spin',
  speaking: 'border-primary/40 motion-safe:animate-pulse',
};

/** The ring around the Talk button while a turn is listening, thinking or speaking. It is still under reduced motion, and the state is also said in words beside it. */
function VoiceStateRing({ state, children }: VoiceStateRingProps) {
  return (
    <span className='relative inline-flex'>
      {state !== 'idle' && (
        <span
          aria-hidden='true'
          className={join(
            'pointer-events-none absolute -inset-1.5 rounded-full border-2',
            RING[state],
          )}
        />
      )}
      {children}
    </span>
  );
}

export default VoiceStateRing;
