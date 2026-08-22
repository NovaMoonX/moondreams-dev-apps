import AppToggle from '@/components/AppToggle';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';
import { Moon, Sun } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme, resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const Icon = isDarkMode ? Moon : Sun;

  return (
    <div className={join('flex items-center gap-2', className)}>
      <AppToggle size='sm' checked={isDarkMode} onCheckedChange={toggleTheme} />
      <Icon className='text-foreground size-4' />
    </div>
  );
}

export default ThemeToggle;
