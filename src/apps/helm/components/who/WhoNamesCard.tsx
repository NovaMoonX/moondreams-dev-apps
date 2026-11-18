import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Tag, Users } from 'lucide-react';

import WhoKinSheet from '@apps/helm/components/who/WhoKinSheet';
import WhoNamesSheet from '@apps/helm/components/who/WhoNamesSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenWho } from '@apps/helm/types';
import { formatKin } from '@apps/helm/utils/kinText';

interface WhoNamesCardProps {
  who: OpenWho;
  /** Which sheet the page's menu opened. */
  openSheet: 'names' | 'kin' | null;
  onOpen: (sheet: 'names' | 'kin' | null) => void;
}

/** "Family" and "Also called" under a person's name, each opening its own sheet. Family is for a person who is not the self. */
function WhoNamesCard({ who, openSheet, onOpen }: WhoNamesCardProps) {
  const hasFamily = who.kind === 'person' && !who.isSelf;
  const rows = [
    ...(hasFamily
      ? [
          {
            key: 'kin' as const,
            Icon: Users,
            label: HELM_COPY.whoNamesFamily,
            value: who.kin ? formatKin(who.kin) : HELM_COPY.whoNamesAdd,
          },
        ]
      : []),
    {
      key: 'names' as const,
      Icon: Tag,
      label: HELM_COPY.whoNamesAlsoCalled,
      value:
        who.aliases.length > 0 ? who.aliases.join(', ') : HELM_COPY.whoNamesAdd,
    },
  ];

  return (
    <>
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {rows.map(({ key, Icon, label, value }) => (
          <li key={key}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
              onClick={() => onOpen(key)}
            >
              <Icon
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='text-foreground shrink-0 text-[15px]'>
                {label}
              </span>
              <span className='text-muted-foreground min-w-0 flex-1 truncate text-right text-[15px]'>
                {value}
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
      </ul>
      <WhoNamesSheet
        isOpen={openSheet === 'names'}
        onClose={() => onOpen(null)}
        who={who}
      />
      {hasFamily && (
        <WhoKinSheet
          isOpen={openSheet === 'kin'}
          onClose={() => onOpen(null)}
          who={who}
        />
      )}
    </>
  );
}

export default WhoNamesCard;
