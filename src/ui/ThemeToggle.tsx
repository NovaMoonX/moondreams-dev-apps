import { Toggle } from '@moondreamsdev/dreamer-ui/components';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';
import { Moon, Sun } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme, resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const Icon = isDarkMode ? Moon : Sun;

  return (
    <div className={join('flex items-center gap-1', className)}>
      <Toggle size='sm' checked={isDarkMode} onCheckedChange={toggleTheme} thumbClassName={isDarkMode ? 'bg-primary-foreground!' : undefined} />
      <Icon className='text-foreground size-4' />
    </div>
  );
}

export default ThemeToggle;
