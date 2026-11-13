import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ThemePicker from '@/components/ThemePicker';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import SettingsSection from '@apps/helm/components/settings/SettingsSection';
import {
  DEFAULT_HELM_THEME,
  HELM_COPY,
  HELM_THEMES,
} from '@apps/helm/constants';
import { setHelmTheme } from '@apps/helm/store/actions/settingsActions';

function ColoursSection() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const theme = useAppSelector(
    (state) => state.helm.profile?.theme ?? DEFAULT_HELM_THEME,
  );

  const pick = (next: typeof theme) => {
    if (!user || next === theme) return;
    setHelmTheme(user.uid, next).catch((error) => {
      console.error('Helm theme was not saved', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
  };

  return (
    <SettingsSection title={HELM_COPY.settingsColours}>
      <li className='space-y-3 py-3'>
        <p className='text-muted-foreground text-sm text-pretty'>
          {HELM_COPY.coloursHint}
        </p>
        <ThemePicker
          label={HELM_COPY.coloursLabel}
          options={HELM_THEMES}
          value={theme}
          onChange={pick}
          lightLabel={HELM_COPY.coloursLight}
          darkLabel={HELM_COPY.coloursDark}
        />
      </li>
    </SettingsSection>
  );
}

export default ColoursSection;
