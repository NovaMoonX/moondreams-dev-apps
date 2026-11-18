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
import ShowMoreButton from '@/components/ShowMoreButton';
import FiguredOutSheet from '@apps/helm/components/who/FiguredOutSheet';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { HELM_COPY } from '@apps/helm/constants';
import { CONNECTION_KINDS, readFromSide } from '@apps/helm/engine/connections';
import {
  selectFiguredOutByWho,
  selectShownConnections,
} from '@apps/helm/store/selectors/connectionSelectors';
import type { OpenWho } from '@apps/helm/types';
import { toFiguredSide, toSideLine } from '@apps/helm/utils/connectionText';

const FIGURED_SHOWN = 5;

const shownName = (other: OpenWho) =>
  other.isUnreadable ? HELM_COPY.unreadable : other.name;

interface ConnectionsSectionProps {
  who: OpenWho;
}

/** The people this one is linked to, each with what they are to them, then those worked out from what is stored, quieter and marked Figured out; every action is in the row's sheet. */
function ConnectionsSection({ who }: ConnectionsSectionProps) {
  const [target, setTarget] = useState<ConnectionTarget | null>(null);
  const [figuredOtherId, setFiguredOtherId] = useState<string | null>(null);
  const [isShowingAllFigured, setIsShowingAllFigured] = useState(false);
  const figuredOut = useAppSelector(selectFiguredOutByWho);
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
  const figuredRows = (figuredOut.get(who.id) ?? [])
    .flatMap((link) => {
      const other = people.find(
        (entry) =>
          entry.id === (link.firstId === who.id ? link.secondId : link.firstId),
      );
      return other ? [{ link, other, side: toFiguredSide(link, who.id) }] : [];
    })
    .sort((a, b) => a.other.name.localeCompare(b.other.name));
  const shownFigured = isShowingAllFigured
    ? figuredRows
    : figuredRows.slice(0, FIGURED_SHOWN);
  const hiddenCount = figuredRows.length - shownFigured.length;

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.connectionsTitle} />
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {rows.map(({ connection, side, other }) => (
          <li key={connection.id}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto min-h-16 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-2 text-left focus-visible:-outline-offset-2'
              onClick={() => setTarget({ kind: 'row', id: connection.id })}
            >
              <WhoMark kind={other.kind} name={shownName(other)} />
              <span className='min-w-0 flex-1'>
                <PrivateTitle
                  kind='who'
                  record={other}
                  className={join(
                    'text-[15px] break-words',
                    side.isPast ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {shownName(other)}
                </PrivateTitle>
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {toSideLine(
                    connection.kind,
                    side,
                    who.isSelf ? null : who.name,
                  )}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
        {shownFigured.map(({ link, side, other }) => (
          <li key={`${link.firstId}_${link.secondId}`}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto min-h-16 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-2 text-left focus-visible:-outline-offset-2'
              onClick={() => setFiguredOtherId(other.id)}
            >
              <WhoMark kind={other.kind} name={shownName(other)} />
              <span className='min-w-0 flex-1'>
                <PrivateTitle
                  kind='who'
                  record={other}
                  className='text-muted-foreground text-[15px] break-words'
                >
                  {shownName(other)}
                </PrivateTitle>
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {toSideLine('family', side, who.isSelf ? null : who.name)}{' '}
                  <span className='whitespace-nowrap'>
                    {HELM_COPY.figuredSuffix}
                  </span>
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
      {hiddenCount > 0 && (
        <ShowMoreButton onClick={() => setIsShowingAllFigured(true)}>
          {HELM_COPY.figuredMore(hiddenCount)}
        </ShowMoreButton>
      )}
      <ConnectionSheet
        isOpen={target !== null}
        onClose={() => setTarget(null)}
        who={who}
        target={target}
      />
      <FiguredOutSheet
        isOpen={figuredOtherId !== null}
        onClose={() => setFiguredOtherId(null)}
        who={who}
        otherId={figuredOtherId}
      />
    </section>
  );
}

export default ConnectionsSection;
