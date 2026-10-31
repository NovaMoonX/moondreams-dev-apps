import { useTheme, type Theme } from '@moondreamsdev/dreamer-ui/hooks';
import { Moon, Sun, SunMoon } from 'lucide-react';

import SegmentedControl, {
  type SegmentOption,
} from '@/components/SegmentedControl';

const THEME_OPTIONS: readonly SegmentOption<Theme>[] = [
  {
    value: 'system',
    label: 'Auto',
    icon: SunMoon,
    ariaLabel: 'Auto, match this device',
  },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** The site-wide Auto / Light / Dark choice; Auto follows the device's setting. */
function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className='space-y-2 px-2'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-foreground text-base font-semibold'>Theme</span>
        {theme === 'system' && (
          <span className='text-muted-foreground truncate text-xs'>
            Follows your device
          </span>
        )}
      </div>
      <SegmentedControl
        label='Choose a theme'
        options={THEME_OPTIONS}
        value={theme}
        onChange={setTheme}
      />
    </div>
  );
}

export default ThemePicker;
