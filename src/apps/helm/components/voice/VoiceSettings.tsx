import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { setVoiceMode } from '@apps/helm/store/actions/settingsActions';
import type { VoiceMode } from '@apps/helm/types';

interface VoiceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Where listening may happen: with the voice service while online, or in this browser only. */
function VoiceSettings({ isOpen, onClose }: VoiceSettingsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const [pendingMode, setPendingMode] = useState<VoiceMode | null>(null);
  const isDeviceOnly = (pendingMode ?? voiceMode) === 'deviceOnly';

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

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.settingsVoiceRowTitle}
      footer={
        <Button type='button' variant='primary' onClick={onClose}>
          {HELM_COPY.voiceDone}
        </Button>
      }
    >
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1 text-pretty'>
          <p className='text-[15px] leading-[21px] font-medium'>
            {HELM_COPY.voiceDeviceOnlyTitle}
          </p>
          <p className='text-muted-foreground text-[15px] leading-[21px]'>
            {HELM_COPY.voiceDeviceOnlyHint}
          </p>
        </div>
        <AppToggle
          checked={isDeviceOnly}
          onCheckedChange={change}
          aria-label={HELM_COPY.voiceDeviceOnlyTitle}
        />
      </div>
    </DetailSheet>
  );
}

export default VoiceSettings;
