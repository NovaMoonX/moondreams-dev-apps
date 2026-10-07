import { useState } from 'react';

import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { SlidersHorizontal } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import IconBadge from '@/components/IconBadge';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface ViewOption {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Counts toward the badge on the trigger when the option differs from its default. */
  isCustomized: boolean;
}

interface ViewOptionGroup {
  heading: string;
  options: ViewOption[];
}

interface TimelineViewOptionsProps {
  groups: ViewOptionGroup[];
}

function TimelineViewOptions({ groups }: TimelineViewOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const customizedCount = groups.flatMap((group) => group.options).filter((option) => option.isCustomized).length;

  const trigger = (
    <Button type='button' variant='tertiary' size='sm' className="relative gap-2 whitespace-nowrap before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']" onClick={() => setIsOpen((open) => !open)}>
      <IconBadge icon={<SlidersHorizontal className='h-4 w-4' />} count={customizedCount} />
      View options
    </Button>
  );

  const content = (
    <div className='space-y-4'>
      {groups.map((group) => (
        <div key={group.heading} className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>{group.heading}</h3>
          <div className='divide-border divide-y'>
            {group.options.map((option) => (
              <label key={option.label} className='flex items-center justify-between gap-4 py-2.5 text-sm'>
                {option.label}
                <AppToggle size='sm' checked={option.checked} onCheckedChange={option.onChange} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title='View options'>
          {content}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement='bottom'
      alignment='end'
      className='w-72 p-3'
    >
      {content}
    </Popover>
  );
}

export default TimelineViewOptions;
