import { useTheme, type Theme } from '@moondreamsdev/dreamer-ui/hooks';
import { Moon, Sun, SunMoon } from 'lucide-react';

import { PillGroup, type PillOption } from '@/components/PillGroup';
import IconTile from '@/ui/IconTile';

const THEME_OPTIONS: readonly PillOption<Theme>[] = [
  { value: 'system', label: 'Auto', ariaLabel: 'Auto, match this device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const THEME_ICONS = { system: SunMoon, light: Sun, dark: Moon };

/** The site-wide Auto / Light / Dark choice; Auto follows the device's setting. */
function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICONS[theme];

  return (
    <div className='space-y-3'>
      <span className='flex items-center gap-3'>
        <IconTile>
          <Icon className='size-5' />
        </IconTile>
        <span className='flex min-w-0 flex-col'>
          <span className='text-foreground text-base'>Theme</span>
          <span className='text-muted-foreground text-xs'>
            {theme === 'system'
              ? 'Follows your device'
              : 'Saved on this device'}
          </span>
        </span>
      </span>
      <PillGroup
        label='Theme'
        options={THEME_OPTIONS}
        value={theme}
        onChange={setTheme}
        isThin
      />
    </div>
  );
}

export default ThemePicker;
