import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import {
  useOnDeviceRecognition,
  type OnDeviceRecognition,
} from '@/hooks/useOnDeviceRecognition';
import { useAppSelector } from '@/store';
import { canUseBrowserStt } from '@/lib/speech/voice/browserStt';
import VoicePicker from '@apps/helm/components/voice/VoicePicker';
import { HELM_COPY } from '@apps/helm/constants';
import { findHelmVoice, toFeelLabel } from '@apps/helm/voices';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  setHandsFreeOn,
  setVoiceMode,
  setWakeWordOn,
} from '@apps/helm/store/actions/settingsActions';
import type { VoiceMode } from '@apps/helm/types';

interface VoiceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A description that keeps the height of the longest line it can become, so a row never moves what is under it when its words change. */
function SteadyText({
  text,
  alternatives = [],
  isLive = false,
}: {
  text: string;
  alternatives?: string[];
  isLive?: boolean;
}) {
  return (
    <div className='text-muted-foreground grid text-[15px] leading-[21px]'>
      <p className='[grid-area:1/1]' aria-live={isLive ? 'polite' : undefined}>
        {text}
      </p>
      {alternatives
        .filter((other) => other !== text)
        .map((other) => (
          <p
            key={other}
            className='invisible [grid-area:1/1]'
            aria-hidden='true'
          >
            {other}
          </p>
        ))}
    </div>
  );
}

interface SwitchRowProps {
  title: string;
  description: string;
  alternatives?: string[];
  checked: boolean;
  isLocked?: boolean;
  onChange: (isOn: boolean) => void;
}

function SwitchRow({
  title,
  description,
  alternatives,
  checked,
  isLocked = false,
  onChange,
}: SwitchRowProps) {
  return (
    <div className='flex items-start gap-3'>
      <div className='min-w-0 flex-1 text-pretty'>
        <p
          className={join(
            'text-[15px] leading-[21px] font-medium',
            isLocked && 'text-muted-foreground',
          )}
        >
          {title}
        </p>
        <SteadyText text={description} alternatives={alternatives} />
      </div>
      {isLocked ? (
        <Lock
          className='text-muted-foreground size-5 shrink-0'
          aria-hidden='true'
        />
      ) : (
        <AppToggle
          checked={checked}
          onCheckedChange={onChange}
          aria-label={title}
        />
      )}
    </div>
  );
}

const toMb = (bytes: number) => Math.round(bytes / 1_000_000);

type OfflineAction = 'download' | 'cancel' | 'remove' | 'retry' | null;

const ACTION_CLASS =
  "relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";

const readOffline = (
  onDevice: OnDeviceRecognition,
  name: string,
): { description: string; action: OfflineAction } => {
  if (onDevice.isDownloading) {
    return {
      description: HELM_COPY.voiceOfflineDownloading(
        toMb(onDevice.loadedBytes),
        onDevice.sizeMb,
      ),
      action: 'cancel',
    };
  }
  if (onDevice.problem === 'start') {
    return { description: HELM_COPY.voiceOfflineStartFailed, action: 'remove' };
  }
  if (onDevice.isOn) {
    return {
      description: HELM_COPY.voiceOfflineReady(onDevice.sizeMb),
      action: 'remove',
    };
  }
  if (onDevice.problem === 'space') {
    return { description: HELM_COPY.voiceOfflineNoRoom, action: 'retry' };
  }
  if (onDevice.problem !== null) {
    return {
      description:
        onDevice.problem === 'check'
          ? HELM_COPY.voiceOfflineCheckFailed
          : HELM_COPY.voiceOfflineStopped,
      action: 'retry',
    };
  }
  return {
    description: HELM_COPY.voiceOfflineOffer(name, onDevice.sizeMb),
    action: onDevice.isStored === false ? 'download' : null,
  };
};

/** The opt-in download of the recognizer that hears the person on this phone, in each of its states, all the same height; a phone that can't run it is told why, with a lock and no button. */
function OfflineListeningRow({
  onDevice,
  name,
}: {
  onDevice: OnDeviceRecognition;
  name: string;
}) {
  const { addToast } = useToast();

  if (onDevice.block !== null) {
    return (
      <SwitchRow
        title={HELM_COPY.voiceOfflineTitle}
        description={HELM_COPY.voiceOfflineBlocked[onDevice.block]}
        checked={false}
        isLocked
        onChange={() => undefined}
      />
    );
  }

  const { description, action } = readOffline(onDevice, name);
  const progress = Math.round(
    (onDevice.loadedBytes / onDevice.totalBytes) * 100,
  );
  const alternatives = [
    HELM_COPY.voiceOfflineOffer(name, onDevice.sizeMb),
    HELM_COPY.voiceOfflineReady(onDevice.sizeMb),
    HELM_COPY.voiceOfflineStartFailed,
    HELM_COPY.voiceOfflineNoRoom,
    HELM_COPY.voiceOfflineCheckFailed,
    HELM_COPY.voiceOfflineStopped,
  ];

  const remove = () => {
    onDevice.remove();
    addToast({
      title: HELM_COPY.voiceOfflineRemoved,
      type: 'info',
      action: { label: HELM_COPY.voiceOfflineUndo, onClick: onDevice.download },
    });
  };

  const actions = {
    download: { label: HELM_COPY.voiceOfflineDownload, run: onDevice.download },
    retry: { label: HELM_COPY.voiceOfflineTryAgain, run: onDevice.download },
    cancel: { label: HELM_COPY.voiceOfflineCancel, run: onDevice.cancel },
    remove: { label: HELM_COPY.voiceOfflineRemove, run: remove },
  };
  const chosen = action === null ? null : actions[action];

  return (
    <div className='flex flex-col gap-2 text-pretty'>
      <div>
        <p className='text-[15px] leading-[21px] font-medium'>
          {HELM_COPY.voiceOfflineTitle}
        </p>
        <SteadyText text={description} alternatives={alternatives} isLive />
      </div>
      <div className='h-1.5'>
        {onDevice.isDownloading && (
          <div
            className='bg-muted h-full overflow-hidden rounded-full'
            role='progressbar'
            aria-label={HELM_COPY.voiceOfflineTitle}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className='bg-primary h-full rounded-full'
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className='flex h-7 items-start'>
        {chosen !== null && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className={ACTION_CLASS}
            onClick={chosen.run}
          >
            {chosen.label}
          </Button>
        )}
      </div>
      <p className='text-muted-foreground mt-1 text-[13px] leading-[18px]'>
        <HelpTip
          title={HELM_COPY.voiceOfflineLicencesTitle}
          linkLabel={HELM_COPY.voiceOfflineLicences}
          className="relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
        >
          {HELM_COPY.voiceOfflineCredits(onDevice.credits)}
        </HelpTip>
      </p>
    </div>
  );
}

/** Where listening may happen: with the voice service while online, or on this device only (the downloaded recognizer, else the browser's own). */
function VoiceSettings({ isOpen, onClose }: VoiceSettingsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const [pendingMode, setPendingMode] = useState<VoiceMode | null>(null);
  const isDeviceOnly = (pendingMode ?? voiceMode) === 'deviceOnly';
  const name = useAssistantName();
  const isWakeWordOn = useAppSelector(
    (state) => state.helm.profile?.isWakeWordOn ?? false,
  );
  const isHandsFreeOn = useAppSelector(
    (state) => state.helm.profile?.isHandsFreeOn ?? true,
  );
  const onDevice = useOnDeviceRecognition({
    lang: navigator.language || 'en-US',
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const chosenVoice = findHelmVoice(
    useAppSelector((state) => state.helm.profile?.voiceId ?? null),
  );
  const canListenForPhrase = canUseBrowserStt() || onDevice.isOn;

  const change = (isOn: boolean) => {
    if (!user) return;
    const next: VoiceMode = isOn ? 'deviceOnly' : 'cloudWhenOnline';
    setPendingMode(next);
    setVoiceMode(user.uid, next)
      .catch((error: unknown) => {
        console.error('Helm voice mode was not changed', error);
        addToast({ title: HELM_COPY.voiceModeFailed, type: 'error' });
      })
      .finally(() => setPendingMode(null));
  };

  const changeSwitch = (
    write: (uid: string, isOn: boolean) => Promise<void>,
    isOn: boolean,
  ) => {
    if (!user) return;
    write(user.uid, isOn).catch((error: unknown) => {
      console.error('Helm voice setting was not changed', error);
      addToast({ title: HELM_COPY.voiceModeFailed, type: 'error' });
    });
  };

  return (
    <>
      <DetailSheet
        isOpen={isOpen && !isPickerOpen}
        onClose={onClose}
        title={HELM_COPY.settingsVoiceRowTitle}
        footer={
          <div className='px-6 pt-2 pb-3'>
            <ModalFooterActions
              rightActions={
                <Button type='button' variant='primary' onClick={onClose}>
                  {HELM_COPY.voiceDone}
                </Button>
              }
            />
          </div>
        }
      >
        <div className='flex flex-col gap-5'>
          <SwitchRow
            title={HELM_COPY.voiceDeviceOnlyTitle}
            description={
              onDevice.isOn
                ? isDeviceOnly
                  ? HELM_COPY.voiceDeviceOnlyOnOffline
                  : HELM_COPY.voiceDeviceOnlyOffOffline
                : isDeviceOnly
                  ? HELM_COPY.voiceDeviceOnlyOn
                  : HELM_COPY.voiceDeviceOnlyOff
            }
            alternatives={
              isDeviceOnly
                ? [
                    HELM_COPY.voiceDeviceOnlyOnOffline,
                    HELM_COPY.voiceDeviceOnlyOn,
                  ]
                : [
                    HELM_COPY.voiceDeviceOnlyOffOffline,
                    HELM_COPY.voiceDeviceOnlyOff,
                  ]
            }
            checked={isDeviceOnly}
            onChange={change}
          />
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            className='h-auto min-h-10 items-start justify-start gap-3 rounded-xl p-0 text-left font-normal'
            onClick={() => setIsPickerOpen(true)}
          >
            <span className='flex min-w-0 flex-1 flex-col text-pretty'>
              <span className='text-foreground text-[15px] leading-[21px] font-medium'>
                {HELM_COPY.voicePickerRowTitle}
              </span>
              <span className='text-muted-foreground text-[15px] leading-[21px]'>
                {HELM_COPY.voicePickerRowHint(
                  chosenVoice.name,
                  toFeelLabel(chosenVoice.feel),
                )}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground mt-0.5 size-5 shrink-0'
              aria-hidden='true'
            />
          </Button>
          <SwitchRow
            title={HELM_COPY.voiceHandsFreeTitle}
            description={
              isHandsFreeOn
                ? HELM_COPY.voiceHandsFreeOn
                : HELM_COPY.voiceHandsFreeOff
            }
            checked={isHandsFreeOn}
            onChange={(isOn) => changeSwitch(setHandsFreeOn, isOn)}
          />
          <SwitchRow
            title={HELM_COPY.voiceWakeTitle(name)}
            description={
              onDevice.isOn
                ? HELM_COPY.voiceWakeOffline(name)
                : canListenForPhrase
                  ? HELM_COPY.voiceWake(name)
                  : HELM_COPY.voiceWakeLocked
            }
            alternatives={[
              HELM_COPY.voiceWakeOffline(name),
              HELM_COPY.voiceWake(name),
              HELM_COPY.voiceWakeLocked,
            ]}
            checked={canListenForPhrase && isWakeWordOn}
            isLocked={!canListenForPhrase}
            onChange={(isOn) => changeSwitch(setWakeWordOn, isOn)}
          />
          <OfflineListeningRow onDevice={onDevice} name={name} />
        </div>
      </DetailSheet>
      {isOpen && isPickerOpen && (
        <VoicePicker onClose={() => setIsPickerOpen(false)} />
      )}
    </>
  );
}

export default VoiceSettings;
