import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Globe } from 'lucide-react';

import TimezoneSelect from '@/components/forms/TimezoneSelect';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';

interface TimezoneFieldProps {
  value: string;
  onChange: (timezone: string) => void;
  /** Help text under the field, given the current zone's readable name. */
  describe: (zoneLabel: string) => ReactNode;
  changeLabel?: string;
  disabled?: boolean;
}

function TimezoneField({
  value,
  onChange,
  describe,
  changeLabel = 'Change time zone',
  disabled = false,
}: TimezoneFieldProps) {
  const [isChanging, setIsChanging] = useState(false);

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-right text-xs'>
        {describe(formatTimezoneLabel(value))}
      </p>
      {isChanging ? (
        <TimezoneSelect value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={disabled}
          onClick={() => setIsChanging(true)}
        >
          <Globe className='mr-1.5 h-3.5 w-3.5' />
          {changeLabel}
        </Button>
      )}
    </div>
  );
}

export default TimezoneField;
