import { useMemo, useState } from 'react';

import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { SyncedTaskRow } from '@apps/helm/components/today/SyncedCard';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import StaleSourceLine from '@apps/helm/components/today/StaleSourceLine';
import { HELM_COPY, TODAY_SYNCED_ROWS } from '@apps/helm/constants';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { SyncedRecord } from '@apps/helm/types';
import {
  getLiveRecords,
  isLiveCategory,
  isStale,
  isTaskForToday,
  syncsInBackground,
} from '@apps/helm/utils/synced';

interface SyncedTodayProps {
  now: number;
}

const groupKey = (record: SyncedRecord) =>
  `${record.grantId}|${record.category}`;

/** Today's task lists copied from connected apps, with a line wherever a source is out of date. A copy shows only while its connection is live with that category on, or as a kept copy of an ended one; its sheet says it is no longer updated. */
function SyncedToday({ now }: SyncedTodayProps) {
  const { nameOf, categoryLabelOf } = useSourceAppName();
  const { grants } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const stored = useAppSelector((state) => state.helm.synced.items);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);

  const records = useMemo(
    () => getLiveRecords(stored, grants, true),
    [stored, grants],
  );
  const taskGroups = useMemo(
    () =>
      [
        ...records
          .filter((record) => isTaskForToday(record, now, timeZone))
          .reduce(
            (groups, record) =>
              groups.set(groupKey(record), [
                ...(groups.get(groupKey(record)) ?? []),
                record,
              ]),
            new Map<string, SyncedRecord[]>(),
          )
          .values(),
      ].map((group) =>
        group.sort((a, b) => a.sealed.title.localeCompare(b.sealed.title)),
      ),
    [records, now, timeZone],
  );
  const staleLines = grants
    .filter((grant) => syncsInBackground(grant.connectorId))
    .flatMap((grant) =>
      Object.entries(grant.categories)
        .filter(
          ([category, entry]) =>
            entry.isOn &&
            !isLiveCategory(grant.connectorId, category) &&
            grant.status === 'live' &&
            isStale(grant.categoryState[category]?.lastOkAt ?? null, now),
        )
        .map(([category]) => ({
          key: `${grant.id}|${category}`,
          label: HELM_COPY.syncedGroup(
            categoryLabelOf(grant.connectorId, category),
            nameOf(grant.connectorId),
          ),
          lastOkAt: grant.categoryState[category]?.lastOkAt ?? null,
        })),
    );
  const openRecord = records.find((record) => record.id === openId) ?? null;

  if (taskGroups.length === 0 && staleLines.length === 0) return null;

  return (
    <>
      <section className='space-y-3'>
        <SectionDivider label={HELM_COPY.syncedTodayFromApps} />
        {taskGroups.map((group) => {
          const key = groupKey(group[0]);
          const isOpen = expanded.includes(key);
          const shown = isOpen ? group : group.slice(0, TODAY_SYNCED_ROWS);
          return (
            <div key={key} className='space-y-2'>
              <h2 className='text-muted-foreground text-[13px]'>
                {HELM_COPY.syncedGroup(
                  categoryLabelOf(group[0].connectorId, group[0].category),
                  nameOf(group[0].connectorId),
                )}
              </h2>
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {shown.map((record) => (
                  <li key={record.id}>
                    <SyncedTaskRow
                      record={record}
                      onOpen={(opened) => setOpenId(opened.id)}
                    />
                  </li>
                ))}
              </ul>
              {group.length > TODAY_SYNCED_ROWS && (
                <ShowMoreButton
                  isOpen={isOpen}
                  onClick={() =>
                    setExpanded((current) =>
                      isOpen
                        ? current.filter((id) => id !== key)
                        : [...current, key],
                    )
                  }
                >
                  {isOpen
                    ? HELM_COPY.syncedFewer
                    : HELM_COPY.syncedMore(group.length - TODAY_SYNCED_ROWS)}
                </ShowMoreButton>
              )}
            </div>
          );
        })}
        {staleLines.map((line) => (
          <StaleSourceLine
            key={line.key}
            label={line.label}
            lastOkAt={line.lastOkAt}
            now={now}
          />
        ))}
      </section>
      <SyncedSheet
        record={openRecord}
        now={now}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

export default SyncedToday;
