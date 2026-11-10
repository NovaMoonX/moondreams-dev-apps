import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { canUseBrowserStt } from '@/lib/speech/voice/browserStt';
import { HELM_COPY } from '@apps/helm/constants';
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

interface SwitchRowProps {
  title: string;
  description: string;
  checked: boolean;
  isLocked?: boolean;
  onChange: (isOn: boolean) => void;
}

function SwitchRow({
  title,
  description,
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
        <p className='text-muted-foreground text-[15px] leading-[21px]'>
          {description}
        </p>
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

/** Where listening may happen: with the voice service while online, or in this browser only. */
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
  const canListenForPhrase = canUseBrowserStt();

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
    <DetailSheet
      isOpen={isOpen}
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
            isDeviceOnly
              ? HELM_COPY.voiceDeviceOnlyOn
              : HELM_COPY.voiceDeviceOnlyOff
          }
          checked={isDeviceOnly}
          onChange={change}
        />
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
            canListenForPhrase
              ? HELM_COPY.voiceWake(name)
              : HELM_COPY.voiceWakeLocked
          }
          checked={canListenForPhrase && isWakeWordOn}
          isLocked={!canListenForPhrase}
          onChange={(isOn) => changeSwitch(setWakeWordOn, isOn)}
        />
      </div>
    </DetailSheet>
  );
}

export default VoiceSettings;
