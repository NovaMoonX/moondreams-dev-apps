import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Loader2, Lock, Play, Square } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
import NotchedSlider from '@/components/NotchedSlider';
import SectionDivider from '@/components/SectionDivider';
import SegmentedControl from '@/components/SegmentedControl';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { unlockAudio } from '@/lib/speech/audioContext';
import { playSpeechSample } from '@/lib/speech/voice/speechSample';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { setHelmVoice } from '@apps/helm/store/actions/settingsActions';
import { createHelmSpeechSource } from '@apps/helm/utils/helmSpeechSource';
import {
  findHelmVoice,
  HELM_VOICE_GROUPS,
  HELM_VOICE_SPEEDS,
  HELM_VOICES,
  toFeelLabel,
  toHelmVoiceSpeed,
  type HelmVoice,
  type HelmVoiceGender,
} from '@apps/helm/voices';

interface VoicePickerProps {
  onClose: () => void;
}

type Sample = { key: string; phase: 'starting' | 'playing' };

const SPEED_LABELS: Record<number, string> = {
  0.8: HELM_COPY.voicePickerSlower,
  1: HELM_COPY.voicePickerNormal,
  1.2: HELM_COPY.voicePickerFaster,
};

const SPEED_OPTIONS = HELM_VOICE_SPEEDS.map((speed) => ({
  value: String(speed),
  label: SPEED_LABELS[speed] ?? '',
  ariaLabel: SPEED_LABELS[speed] ?? `${speed} times normal pace`,
}));

const GENDERS = [
  { value: 'female', label: HELM_COPY.voicePickerWomen },
  { value: 'male', label: HELM_COPY.voicePickerMen },
] as const;

/** The full page that picks the assistant's cloud voice from every voice offered and sets its speed; a tap on a row saves it at once, and each row plays a sample. */
function VoicePicker({ onClose }: VoicePickerProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOffline = useNetworkStatus() === 'offline';
  const profile = useAppSelector((state) => state.helm.profile);
  const isCloudOn = profile?.voiceMode === 'cloudWhenOnline';
  const isLocked = !isCloudOn || isOffline;
  const savedVoice = findHelmVoice(profile?.voiceId ?? null);
  const savedSpeed = toHelmVoiceSpeed(profile?.voiceSpeed ?? null);
  const [gender, setGender] = useState<HelmVoiceGender>(savedVoice.gender);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingSpeed, setPendingSpeed] = useState<number | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [source] = useState(createHelmSpeechSource);
  const playing = useRef<{ stop: () => void } | null>(null);
  const chosen = pendingName ?? savedVoice.name;
  const speed = pendingSpeed ?? savedSpeed;

  useEffect(
    () => () => {
      playing.current?.stop();
    },
    [],
  );

  const stopSample = () => {
    playing.current?.stop();
    playing.current = null;
    setSample(null);
  };

  const play = (key: string, voiceId: string, voiceSpeed: number) => {
    stopSample();
    setSample({ key, phase: 'starting' });
    const current = playSpeechSample({
      source,
      text: HELM_COPY.voicePickerSampleLine,
      voice: { voiceId, speed: voiceSpeed },
      onStart: () => {
        if (playing.current === current) setSample({ key, phase: 'playing' });
      },
    });
    playing.current = current;
    void current.done.then((result) => {
      if (playing.current !== current) return;
      playing.current = null;
      setSample(null);
      if (result === 'failed') {
        addToast({ title: HELM_COPY.voicePickerSampleFailed, type: 'info' });
      }
    });
  };

  const toggleSample = (voice: HelmVoice) => {
    if (isLocked) {
      addToast({ title: HELM_COPY.voicePickerSamplesLocked, type: 'info' });
      return;
    }
    if (sample?.key === voice.name) stopSample();
    else play(voice.name, voice.name, speed);
  };

  const save = (voiceId: string | null, voiceSpeed: number | null) =>
    user
      ? setHelmVoice(user.uid, { voiceId, voiceSpeed })
      : Promise.reject(new Error('Not signed in'));

  const fail = (error: unknown) => {
    console.error('Helm voice was not saved', error);
    addToast({ title: HELM_COPY.voicePickerSaveFailed, type: 'info' });
  };

  const select = (voice: HelmVoice) => {
    if (voice.name === chosen) return;
    setPendingName(voice.name);
    save(voice.name, profile?.voiceSpeed ?? null)
      .catch(fail)
      .finally(() => setPendingName(null));
  };

  const changeSpeed = (value: string) => {
    const next = Number(value);
    unlockAudio();
    setPendingSpeed(next);
    save(profile?.voiceId ?? null, next)
      .then(() => {
        if (!isLocked) play('speed', chosen, next);
      })
      .catch(fail)
      .finally(() => setPendingSpeed(null));
  };

  return (
    <Subview overlay title={HELM_COPY.voicePickerTitle} onClose={onClose}>
      <div className='flex flex-col gap-5'>
        {isLocked && (
          <InlineNotice tone='info'>
            {HELM_COPY.voicePickerNeedsCloud}
          </InlineNotice>
        )}
        <SegmentedControl
          label={HELM_COPY.voicePickerGender}
          options={GENDERS}
          value={gender}
          onChange={setGender}
        />
        <section className='flex flex-col gap-3'>
          <SectionDivider label={HELM_COPY.voicePickerSpeed} />
          <div className='px-3'>
            <NotchedSlider
              label={HELM_COPY.voicePickerSpeed}
              options={SPEED_OPTIONS}
              value={String(speed)}
              onChange={changeSpeed}
              className='w-full'
            />
          </div>
        </section>
        {HELM_VOICE_GROUPS.map((group) => (
          <section key={group} className='flex flex-col gap-1'>
            <SectionDivider label={HELM_COPY.voicePickerGroups[group]} />
            <ul
              role='radiogroup'
              aria-label={HELM_COPY.voicePickerGroups[group]}
            >
              {HELM_VOICES.filter(
                (voice) => voice.gender === gender && voice.group === group,
              ).map((voice) => {
                const isChosen = voice.name === chosen;
                const phase = sample?.key === voice.name ? sample.phase : null;
                const playLabel = isLocked
                  ? HELM_COPY.voicePickerSamplesLocked
                  : phase === 'starting'
                    ? HELM_COPY.voicePickerStarting(voice.name)
                    : phase === 'playing'
                      ? HELM_COPY.voicePickerStop(voice.name)
                      : HELM_COPY.voicePickerPlay(voice.name);
                const PlayIcon = isLocked
                  ? Lock
                  : phase === 'starting'
                    ? Loader2
                    : phase === 'playing'
                      ? Square
                      : Play;
                return (
                  <li key={voice.name} className='flex items-center gap-1'>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='stripped'
                      role='radio'
                      aria-checked={isChosen}
                      className='min-h-12 min-w-0 flex-1 justify-start gap-3 rounded-xl px-1 text-left font-normal'
                      onClick={() => select(voice)}
                    >
                      <span
                        aria-hidden='true'
                        className={join(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          isChosen
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/40',
                        )}
                      >
                        {isChosen && <Check className='size-3' />}
                      </span>
                      <span className='flex min-w-0 flex-col'>
                        <span className='text-foreground text-[15px] leading-[21px] font-medium'>
                          {voice.name}
                        </span>
                        <span className='text-muted-foreground text-[13px] leading-[18px]'>
                          {toFeelLabel(voice.feel)}
                        </span>
                      </span>
                    </Button>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      rounded='full'
                      aria-label={playLabel}
                      className="relative shrink-0 before:absolute before:-inset-1 before:content-['']"
                      onClick={() => toggleSample(voice)}
                    >
                      <PlayIcon
                        className={join(
                          'size-4',
                          phase === 'starting' && 'animate-spin',
                          isLocked && 'text-muted-foreground',
                        )}
                        aria-hidden='true'
                      />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Subview>
  );
}

export default VoicePicker;
