import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, House, MapPin } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import WhereSheet, {
  type WhereTarget,
} from '@apps/helm/components/where/WhereSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  formatAwayLine,
  keepCurrentAway,
  readWhereabouts,
} from '@apps/helm/engine/whereabouts';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import type { OpenWho } from '@apps/helm/types';
import { toKnownCities, toTrips } from '@apps/helm/utils/whereInputs';

interface WhereCardProps {
  who: OpenWho;
}

interface Row {
  key: string;
  line: string;
  source: string;
  target: WhereTarget | null;
}

/** Where a person lives and the times they are away, each opening what can change it. A trip copied from Waypoint shows on the self's card, read-only. */
function WhereCard({ who }: WhereCardProps) {
  const todayKey = useTodayKey();
  const [target, setTarget] = useState<WhereTarget | null>(null);
  const people = useAppSelector((state) => state.helm.who.items);
  const synced = useAppSelector((state) => state.helm.synced.items);
  const away = useMemo(
    () =>
      keepCurrentAway(who.away ?? [], todayKey).sort((a, b) => a.from - b.from),
    [who.away, todayKey],
  );

  const tripRow = ((): Row | null => {
    if (!who.isSelf) return null;
    const trips = toTrips(synced);
    const found = readWhereabouts({
      dayKey: todayKey,
      home: who.home,
      homeSource: who.homeSource,
      away,
      trips,
      awayEvents: [],
      currentPlaceCity: null,
      knownCities: toKnownCities(people),
    });
    if (found?.source !== 'trip') return null;
    const today = Date.parse(todayKey);
    const trip = trips.find(
      (entry) => entry.from <= today && today <= entry.to,
    );
    return trip
      ? {
          key: 'trip',
          line: formatAwayLine(
            {
              city: {
                ...found.city,
                region: null,
                country: null,
                latitude: 0,
                longitude: 0,
              },
              from: trip.from,
              to: trip.to,
            },
            todayKey,
          ),
          source: HELM_COPY.whereSourceTrip,
          target: null,
        }
      : null;
  })();

  const rows: Row[] = [
    ...(who.home
      ? [
          {
            key: 'home',
            line: HELM_COPY.whereHomeLine(who.home.name),
            source:
              who.homeSource === 'said'
                ? HELM_COPY.whereSourceSaid
                : HELM_COPY.whereSourcePage,
            target: { kind: 'home' } as WhereTarget,
          },
        ]
      : []),
    ...away.map((span) => ({
      key: span.id,
      line: formatAwayLine(span, todayKey),
      source:
        span.source === 'said'
          ? HELM_COPY.whereSourceSaid
          : HELM_COPY.whereSourcePage,
      target: { kind: 'away', spanId: span.id } as WhereTarget,
    })),
    ...(tripRow ? [tripRow] : []),
  ];

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.whereTitle} />
      {rows.length > 0 && (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {rows.map(({ key, line, source, target: rowTarget }) => (
            <li key={key}>
              {rowTarget ? (
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                  onClick={() => setTarget(rowTarget)}
                >
                  {key === 'home' ? (
                    <House
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  ) : (
                    <MapPin
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  )}
                  <span className='min-w-0 flex-1'>
                    <span className='block text-[15px] break-words'>
                      {line}
                    </span>
                    <span className='text-muted-foreground block text-[13px]'>
                      {source}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              ) : (
                <div className='flex min-h-14 items-center gap-3 px-4 py-3'>
                  <MapPin
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='block text-[15px] break-words'>
                      {line}
                    </span>
                    <span className='text-muted-foreground block text-[13px]'>
                      {source}
                    </span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap gap-2'>
        {!who.home && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => setTarget({ kind: 'home' })}
          >
            {HELM_COPY.whereAddHome}
          </Button>
        )}
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => setTarget({ kind: 'away', spanId: null })}
        >
          {HELM_COPY.whereAddAway}
        </Button>
      </div>
      <WhereSheet
        who={who}
        target={target}
        todayKey={todayKey}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

export default WhereCard;
