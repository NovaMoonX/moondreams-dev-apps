import { useMemo, useState } from 'react';

import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { MAX_ALERTS } from '@apps/runway/engine/alerts';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import AlertLadder from '@apps/runway/components/AlertLadder';
import AlertSheet from '@apps/runway/forms/AlertSheet';
import { useAlerts } from '@apps/runway/hooks/useAlerts';
import type { AlertTarget, Cents } from '@apps/runway/types';

const MINUTE_MS = 60_000;

interface AlertsPanelProps {
  target: AlertTarget;
  /** What the envelope gets each time; null for Free to Spend or an envelope with no set amount. */
  eachTimeCents: Cents | null;
}

/** One set of alerts as a ladder, with the sheet that adds, changes or removes one. */
function AlertsPanel({ target, eachTimeCents }: AlertsPanelProps) {
  const now = useNow(MINUTE_MS);
  const { entries, figureCents } = useAlerts(
    target,
    eachTimeCents,
    todayAsUtcDate(now),
  );
  const isLoaded = useAppSelector((state) => state.runway.isAlertsLoaded);
  const alertCount = useAppSelector((state) => state.runway.alerts.length);
  const stateList = useAppSelector((state) => state.runway.alertStates);
  const states = useMemo(
    () => new Map(stateList.map((state) => [state.id, state])),
    [stateList],
  );
  const { isHidden, isScrambled } = useValuesHidden();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const editedAlert =
    editing === null || editing === 'new'
      ? null
      : (entries.find(({ alert }) => alert.id === editing)?.alert ?? null);
  const highest = Math.max(
    figureCents ?? 0,
    ...entries.map(({ lineCents }) => lineCents ?? 0),
    0,
  );

  return (
    <>
      {isLoaded && (
        <AlertLadder
          entries={entries}
          figureCents={figureCents}
          topCents={eachTimeCents ?? highest}
          states={states}
          isEven={isHidden || isScrambled}
          isFull={alertCount >= MAX_ALERTS}
          now={now}
          onOpen={setEditing}
          onAdd={() => setEditing('new')}
        />
      )}
      {editing !== null && (editing === 'new' || editedAlert !== null) && (
        <AlertSheet
          key={editing}
          target={target}
          eachTimeCents={eachTimeCents}
          alert={editedAlert}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export default AlertsPanel;
