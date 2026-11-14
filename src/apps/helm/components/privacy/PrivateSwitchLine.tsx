import { Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import { HELM_COPY } from '@apps/helm/constants';

interface PrivateSwitchLineProps {
  checked: boolean;
  onCheckedChange: (isPrivate: boolean) => void;
}

/** The Private switch with its one true subtitle, the same on a record's sheet and the new task's. */
function PrivateSwitchLine({
  checked,
  onCheckedChange,
}: PrivateSwitchLineProps) {
  return (
    <div className='flex items-center gap-3'>
      <Lock
        className='text-muted-foreground size-[18px] shrink-0'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <p className='text-foreground text-[15px] leading-[21px]'>
          {HELM_COPY.privateRowTitle}
        </p>
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.privateRowSubtitle}
        </p>
      </div>
      <AppToggle
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={HELM_COPY.privateRowTitle}
      />
    </div>
  );
}

export default PrivateSwitchLine;
