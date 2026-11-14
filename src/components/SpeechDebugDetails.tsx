import DebugDetails from '@/components/DebugDetails';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { detectMicrophoneDevice } from '@/lib/speech/microphonePermission';
import {
  describeSpeechSetup,
  readSpeechEvents,
} from '@/lib/speech/speechDiagnostics';

interface SpeechDebugDetailsProps {
  /** What the screen saw fail, in a line. */
  message: string;
  className?: string;
}

/** Debug details for a failure to listen: the microphone permission, the device, what the browser offers and the last things it said. Only debug viewers see it. */
function SpeechDebugDetails({ message, className }: SpeechDebugDetailsProps) {
  const permission = useMicrophonePermission();
  const events = readSpeechEvents();
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

export default SpeechDebugDetails;
