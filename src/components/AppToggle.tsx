import { Toggle, ToggleProps } from '@moondreamsdev/dreamer-ui/components';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';

function AppToggle({ thumbClassName, ...rest }: ToggleProps) {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  return (
    <Toggle
      size='sm'
      thumbClassName={
        thumbClassName ?? (isDarkMode ? 'bg-primary-foreground!' : undefined)
      }
      {...rest}
    />
  );
}

export default AppToggle;
