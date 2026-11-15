import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import AddRow from '@apps/helm/components/who/AddRow';
import ConnectionSheet, {
  type ConnectionTarget,
} from '@apps/helm/components/who/ConnectionSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { CONNECTION_KINDS, readFromSide } from '@apps/helm/engine/connections';
import { selectShownConnections } from '@apps/helm/store/selectors/connectionSelectors';
import type { OpenWho } from '@apps/helm/types';
import { toRowTail } from '@apps/helm/utils/connectionText';

interface ConnectionsSectionProps {
  who: OpenWho;
}

/** "Connections": the people this one is connected to, read from this side ("Eli · brother", "Sam · married"; a past couple quieter); every action is in the row's sheet. */
function ConnectionsSection({ who }: ConnectionsSectionProps) {
  const [target, setTarget] = useState<ConnectionTarget | null>(null);
  const connections = useAppSelector(selectShownConnections);
  const people = useAppSelector((state) => state.helm.who.items);
  const rows = connections
    .filter((connection) => connection.whoIds.includes(who.id))
    .flatMap((connection) => {
      const side = readFromSide(connection, who.id);
      const other = people.find((entry) => entry.id === side?.otherId);
      return side && other ? [{ connection, side, other }] : [];
    })
    .sort(
      (a, b) =>
        Number(a.side.isPast) - Number(b.side.isPast) ||
        CONNECTION_KINDS.indexOf(a.connection.kind) -
          CONNECTION_KINDS.indexOf(b.connection.kind) ||
        a.other.name.localeCompare(b.other.name),
    );

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.connectionsTitle} />
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {rows.map(({ connection, side, other }) => (
          <li key={connection.id}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
              onClick={() => setTarget({ kind: 'row', id: connection.id })}
            >
              <span className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5'>
                <PrivateTitle
                  kind='who'
                  record={other}
                  className={join(
                    'text-[15px]',
                    side.isPast ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {other.isUnreadable ? HELM_COPY.unreadable : other.name}
                </PrivateTitle>
                <span className='text-muted-foreground text-[13px] break-words'>
                  · {toRowTail(connection.kind, side)}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
        <li>
          <AddRow
            isInList
            label={HELM_COPY.connectionAdd}
            onClick={() => setTarget({ kind: 'add' })}
          />
        </li>
      </ul>
      <ConnectionSheet
        isOpen={target !== null}
        onClose={() => setTarget(null)}
        who={who}
        target={target}
      />
    </section>
  );
}

export default ConnectionsSection;
