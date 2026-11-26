import { ScrollText } from 'lucide-react';

import BackLink from '@/components/BackLink';
import EntryTile from '@/components/EntryTile';
import TurnLogView from '@/components/TurnLogView';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useTurnLog } from '@/hooks/useTurnLog';
import { useCanSeeDebugDetails } from '@/lib/debugProfiles/useCanSeeDebugDetails';
import type { CookVoice } from '@apps/pinch/hooks/useCookVoice';

/** The voice sheet's way into the conversation log; drawn only for debug viewers. */
export function CookTurnLogRow({ onOpen }: { onOpen: () => void }) {
  const canSee = useCanSeeDebugDetails();
  const count = useTurnLog().length;
  if (!canSee) return null;
  return (
    <EntryTile
      icon={<ScrollText className='size-4' aria-hidden='true' />}
      label={`Conversation log · ${count} ${count === 1 ? 'event' : 'events'}`}
      onClick={onOpen}
    />
  );
}

const getListenWords = (voice: CookVoice) => {
  if (!voice.isOn) return 'the mic is off';
  if (voice.phase === 'LOCKED') return 'kept open for 15 minutes';
  return voice.mode === 'WAKE' ? 'waits for “Hey Pepper”' : 'tap to talk';
};

/** The conversation log swapped into the voice sheet, with what is running in its header. */
export function CookTurnLogView({
  voice,
  onBack,
}: {
  voice: CookVoice;
  onBack: () => void;
}) {
  const isPepperOn = useIsGateOpen('pinch', 'pepper');
  return (
    <div className='space-y-3'>
      <BackLink onBack={onBack} label='Back to voice control' />
      <TurnLogView
        expected={{
          listening: 'the browser’s speech recognition (nothing heard yet)',
          voice: voice.natural.isOn
            ? 'natural on-device voice if it is ready, else the browser’s voice (nothing said yet)'
            : 'the browser’s voice (nothing said yet)',
          answers: isPepperOn ? 'no answer from Pepper yet' : 'Pepper is off',
        }}
        facts={[
          `Pepper: ${isPepperOn ? 'on' : 'off'}, mic ${getListenWords(voice)}`,
        ]}
      />
    </div>
  );
}
