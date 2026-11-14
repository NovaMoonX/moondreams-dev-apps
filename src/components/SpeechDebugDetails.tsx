import { useSyncExternalStore } from 'react';

import DebugDetails from '@/components/DebugDetails';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import { detectMicrophoneDevice } from '@/lib/speech/microphonePermission';
import {
  describeSpeechSetup,
  readSpeechEvents,
  subscribeSpeechEvents,
} from '@/lib/speech/speechDiagnostics';

interface SpeechDebugDetailsProps {
  /** What the screen saw fail, in a line. */
  message: string;
  className?: string;
}

function SpeechFacts({ message, className }: SpeechDebugDetailsProps) {
  const permission = useMicrophonePermission();
  const events = useSyncExternalStore(subscribeSpeechEvents, readSpeechEvents);
  return (
    <DebugDetails
      title='What went wrong'
      message={message}
      facts={[
        `Microphone permission: ${permission}`,
        `Device: ${detectMicrophoneDevice()}`,
        ...describeSpeechSetup(),
      ]}
      trace={
        events.length > 0
          ? { label: 'What the browser said', text: events.join('\n') }
          : null
      }
      className={className}
    />
  );
}

/** `DebugDetails` for a failure to listen. Debug viewers only. */
function SpeechDebugDetails(props: SpeechDebugDetailsProps) {
  const canSee = useCanSeeDebugDetails();
  if (!canSee) return null;
  return <SpeechFacts {...props} />;
}

export default SpeechDebugDetails;
