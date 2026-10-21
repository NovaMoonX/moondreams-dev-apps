import { Trash2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { ViewOptionSwitch } from '@/components/ViewOptions';
import type { NaturalVoice } from '@/hooks/useNaturalVoice';
import type { NaturalVoiceProblem } from '@/lib/speech/naturalVoice/naturalVoiceEngine';

const PROBLEM_TEXT: Record<NaturalVoiceProblem, string> = {
  download:
    'The download didn’t finish. Check your connection, then turn it on again.',
  space: 'There isn’t room on this device to keep it.',
  load: 'It couldn’t start on this device, so the usual voice reads.',
  slow: 'It was too slow on this device, so the usual voice reads.',
};

const getDescription = (voice: NaturalVoice) => {
  if (voice.status === 'downloading') {
    return `Downloading… ${Math.round(voice.progress * 100)}%`;
  }
  if (voice.status === 'loading') return 'Getting ready…';
  if (voice.problem !== null) return PROBLEM_TEXT[voice.problem];
  if (voice.isReady) return 'On. It reads with a voice on this device.';
  return `Sounds less robotic. A one-time download of about ${voice.sizeMb} MB, best on Wi-Fi (the voice file comes from ${voice.host}). It runs on this device and sends nothing. It uses eSpeak NG (GPL-3.0, source at github.com/espeak-ng/espeak-ng).`;
};

interface NaturalVoiceOptionProps {
  voice: NaturalVoice;
}

/** The row that turns on the more natural reading voice that runs on the device, saying what it downloads and from where first, with its progress and a way to delete the download. Draws nothing where the page can't run it. */
export function NaturalVoiceOption({ voice }: NaturalVoiceOptionProps) {
  if (!voice.isSupported) return null;
  const isBusy = voice.status === 'downloading' || voice.status === 'loading';

  return (
    <div>
      <ViewOptionSwitch
        label='More natural voice'
        description={getDescription(voice)}
        checked={voice.isOn}
        isDisabled={isBusy}
        onCheckedChange={(isOn) => (isOn ? voice.turnOn() : voice.turnOff())}
      />
      {voice.status === 'downloading' && (
        <div
          role='progressbar'
          aria-label='Voice download'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(voice.progress * 100)}
          className='bg-muted -mt-1 mb-2 h-1.5 overflow-hidden rounded-full'
        >
          <div
            className='bg-primary h-full rounded-full'
            style={{ width: `${Math.round(voice.progress * 100)}%` }}
          />
        </div>
      )}
      {voice.isStored && !isBusy && (
        <ActionChips
          className='mb-2'
          actions={[
            {
              key: 'remove',
              icon: <Trash2 className='h-4 w-4' aria-hidden='true' />,
              label: `Remove the ${voice.sizeMb} MB download`,
              isQuiet: true,
              onClick: voice.remove,
            },
          ]}
        />
      )}
    </div>
  );
}
