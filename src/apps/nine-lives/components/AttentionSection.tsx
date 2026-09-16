import { useMemo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Pill, Stethoscope, Syringe, Trash2 } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';

import { useAttentionFocus } from '../context/attentionFocusContext';
import {
  selectCatsByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectPreventivesByHousehold,
  selectVaccinationsByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import { buildAttentionItems, type AttentionItem, type AttentionSeverity } from '../utils/attentionItems';
import { getDefaultVisitTitle } from '../utils/dateHelpers';

interface AttentionSectionProps {
  householdId: string;
}

interface AttentionRow {
  key: string;
  severity: AttentionSeverity;
  icon: typeof Stethoscope;
  title: string;
  subtitle: string;
  dueLabel: string;
  actionLabel: string;
  onAction: () => void;
}

/** Kept as a plain top-level helper (rather than inline in the component) so `Date.now()` isn't called directly in render. */
function currentTime(): number {
  return Date.now();
}

function formatDueLabel(timestamp: number, now: number): string {
  const diffDays = Math.round((timestamp - now) / 86_400_000);

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays > 0) {
    return `In ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }

  const overdueDays = Math.abs(diffDays);
  return `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
}

function AttentionSection({ householdId }: AttentionSectionProps) {
  const { requestFocus } = useAttentionFocus();
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litterEntries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const vaccinations = useAppSelector(selectVaccinationsByHousehold(householdId), shallowEqual);
  const preventives = useAppSelector(selectPreventivesByHousehold(householdId), shallowEqual);
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);

  const items = useMemo(
    () =>
      buildAttentionItems({
        visits,
        vaccinations,
        preventives,
        litterBoxes,
        litterEntries,
        now: currentTime(),
      }),
    [visits, vaccinations, preventives, litterBoxes, litterEntries],
  );

  const catName = (catId: string) => cats.find((cat) => cat.id === catId)?.name ?? 'a cat';
  const catNames = (catIds: string[]) => catIds.map(catName).join(', ') || 'a cat';

  const toRow = (item: AttentionItem, now: number): AttentionRow | null => {
    switch (item.kind) {
      case 'visit': {
        const visit = visits.find((entry) => entry.id === item.visitId);
        if (!visit) return null;

        return {
          key: `visit-${item.visitId}`,
          severity: item.severity,
          icon: Stethoscope,
          title: visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
          subtitle: catNames(item.catIds),
          dueLabel: formatDueLabel(item.scheduledAt, now),
          actionLabel: 'Complete',
          onAction: () =>
            requestFocus({ kind: 'visit-complete', requestedAt: Date.now(), visitId: item.visitId }),
        };
      }
      case 'litter': {
        const box = litterBoxes.find((entry) => entry.id === item.litterBoxId);
        if (!box) return null;

        return {
          key: `litter-${item.litterBoxId}`,
          severity: item.severity,
          icon: Trash2,
          title: box.name,
          subtitle:
            item.daysSinceChange === null
              ? 'No full change logged yet'
              : `${item.daysSinceChange} day${item.daysSinceChange === 1 ? '' : 's'} since last full change`,
          dueLabel: item.severity === 'now' ? 'Needs attention' : 'Coming up',
          actionLabel: 'Log change',
          onAction: () =>
            requestFocus({ kind: 'litter-log', requestedAt: Date.now(), litterBoxId: item.litterBoxId }),
        };
      }
      case 'vaccination': {
        const vaccination = vaccinations.find((entry) => entry.id === item.vaccinationId);
        if (!vaccination) return null;

        return {
          key: `vaccination-${item.vaccinationId}`,
          severity: item.severity,
          icon: Syringe,
          title: vaccination.name,
          subtitle: catName(item.catId),
          dueLabel: formatDueLabel(item.expiresAt, now),
          actionLabel: 'Log dose',
          onAction: () =>
            requestFocus({
              kind: 'vaccination-log-dose',
              requestedAt: Date.now(),
              catId: item.catId,
              vaccinationId: item.vaccinationId,
            }),
        };
      }
      case 'preventive': {
        const preventive = preventives.find((entry) => entry.id === item.preventiveId);
        if (!preventive) return null;

        return {
          key: `preventive-${item.preventiveId}`,
          severity: item.severity,
          icon: Pill,
          title: preventive.name,
          subtitle: catNames(item.catIds),
          dueLabel: formatDueLabel(item.expiresAt, now),
          actionLabel: 'Log dose',
          onAction: () =>
            requestFocus({
              kind: 'preventive-log-dose',
              requestedAt: Date.now(),
              catId: item.catIds[0],
              preventiveId: item.preventiveId,
            }),
        };
      }
    }
  };

  const now = currentTime();
  const rows = items.map((item) => toRow(item, now)).filter((row): row is AttentionRow => row !== null);
  const nowRows = rows.filter((row) => row.severity === 'now');
  const soonRows = rows.filter((row) => row.severity === 'soon');

  if (rows.length === 0) {
    return null;
  }

  const renderRow = (row: AttentionRow) => {
    const Icon = row.icon;

    return (
      <div key={row.key} className='flex items-center justify-between gap-3 py-2.5 first:pt-0'>
        <div className='flex min-w-0 items-start gap-3'>
          <Icon className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
          <div className='min-w-0'>
            <p className='text-sm font-medium'>{row.title}</p>
            <p className='text-muted-foreground text-sm'>
              {row.subtitle} · {row.dueLabel}
            </p>
          </div>
        </div>
        <Button type='button' variant='secondary' size='sm' onClick={row.onAction} className='shrink-0'>
          {row.actionLabel}
        </Button>
      </div>
    );
  };

  return (
    <section className='rounded-lg border-2 border-primary/30 bg-primary/5 p-4'>
      <h2 className='text-xl font-semibold'>Needs attention</h2>

      {nowRows.length > 0 && (
        <div className='mt-3'>
          <h3 className='text-muted-foreground text-sm font-medium'>Needs attention now</h3>
          <div className='divide-border divide-y'>{nowRows.map(renderRow)}</div>
        </div>
      )}

      {soonRows.length > 0 && (
        <div className='mt-4'>
          <h3 className='text-muted-foreground text-sm font-medium'>Coming up this week</h3>
          <div className='divide-border divide-y'>{soonRows.map(renderRow)}</div>
        </div>
      )}
    </section>
  );
}

export default AttentionSection;
