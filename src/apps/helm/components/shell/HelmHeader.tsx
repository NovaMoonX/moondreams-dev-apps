import { Button } from '@moondreamsdev/dreamer-ui/components';
import type { DropdownMenuProps } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, House } from 'lucide-react';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import HeaderIconButton from '@/components/HeaderIconButton';
import { HELM_COPY } from '@apps/helm/constants';

interface HelmHeaderProps {
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
  /** False on a screen reached only from one parent, where Home would skip a step. */
  showsHome?: boolean;
  menu?: {
    items: DropdownMenuProps['items'];
    onItemSelect: (value: string) => void;
  };
}

/** A content page's header: Back, then Home unless Back already says Home. */
function HelmHeader({
  backLabel,
  onBack,
  onHome,
  showsHome = true,
  menu,
}: HelmHeaderProps) {
  return (
    <header className='flex min-h-10 items-center gap-3'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className="text-foreground! relative h-7! min-h-0! w-fit max-w-full shrink-0 gap-1 py-0! pr-3! pl-1.5! align-top before:absolute before:-inset-x-1.5 before:-inset-y-[7px] before:content-['']"
        onClick={onBack}
      >
        <ChevronLeft className='h-4 w-4 shrink-0' aria-hidden='true' />
        <span className='truncate'>{backLabel}</span>
      </Button>
      {showsHome && backLabel !== 'Home' && (
        <HeaderIconButton
          icon={<House className='size-4' aria-hidden='true' />}
          label='Home'
          onClick={onHome}
        />
      )}
      {menu && (
        <div className='ml-auto shrink-0'>
          <EllipsisDropdown
            items={menu.items}
            onItemSelect={menu.onItemSelect}
            ariaLabel={HELM_COPY.moreActions}
            className="relative size-8 after:absolute after:-inset-1 after:content-['']"
          />
        </div>
      )}
    </header>
  );
}

export default HelmHeader;
