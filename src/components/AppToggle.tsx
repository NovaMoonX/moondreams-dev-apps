import { Toggle, ToggleProps } from '@moondreamsdev/dreamer-ui/components';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';

function AppToggle({ thumbClassName, ...rest }: ToggleProps) {
  const { toggleTheme, resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  return (
    <Toggle
      size='sm'
      checked={isDarkMode}
      onCheckedChange={toggleTheme}
      thumbClassName={
        thumbClassName ?? (isDarkMode ? 'bg-primary-foreground!' : undefined)
      }
      {...rest}
    />
  );
}

export default AppToggle;
