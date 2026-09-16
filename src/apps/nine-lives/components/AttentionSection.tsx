import { useMemo } from 'react';

import { Badge, Button, Disclosure, Pagination, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Trash2 } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { copyToClipboard } from '@/utils/clipboardUtils';
import AvatarStack from '@/ui/AvatarStack';

import { useAttentionFocus } from '../context/attentionFocusContext';
import {
  selectCatsByHousehold,
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectPreventivesByHousehold,
  selectVaccinationsByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import type { VetClinic } from '../types';
import { buildAttentionItems, type AttentionItem, type AttentionSeverity } from '../utils/attentionItems';
import { getDefaultVisitTitle } from '../utils/dateHelpers';
import { usePagination } from '../utils/usePagination';

const OTHER_ROWS_PAGE_SIZE = 5;

interface AttentionSectionProps {
  householdId: string;
}

interface AttentionRow {
  key: string;
  kind: AttentionItem['kind'];
  severity: AttentionSeverity;
  /** Empty for kinds with no associated cat (litter). */
  catIds: string[];
  title: string;
  subtitle: string;
  dueLabel: string;
  actionLabel: string;
  onAction: () => void;
  /** Visit rows only — lets the card surface the vet's contact info. */
  clinic?: VetClinic | null;
  doctorName?: string | null;
}

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Matches dreamer-ui's real Avatar size scale, so the litter-box icon circle lines up exactly with cat avatars next to it. */
const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-8 w-8',
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-20 w-20',
  '2xl': 'h-24 w-24',
};

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

/** Reminders only get a tag when they're actually overdue — "coming up this week" is the default state for everything here, so tagging it too was just noise. */
function getReminderBadgeLabel(severity: AttentionSeverity): string | null {
  return severity === 'now' ? 'Overdue' : null;
}

/**
 * Visits get plain colored text instead of a pill: green for "today" (informational, not a
 * warning — you're just going, nothing's wrong), red for genuinely missed/overdue. Nothing for
 * later-this-week, same as reminders.
 */
function getVisitStatusText(severity: AttentionSeverity, dueLabel: string): { text: string; className: string } | null {
  if (severity !== 'now') {
    return null;
  }

  return dueLabel === 'Today'
    ? { text: 'Today', className: 'text-success font-semibold' }
    : { text: 'Overdue', className: 'text-destructive font-semibold' };
}

function AttentionSection({ householdId }: AttentionSectionProps) {
  const { requestFocus } = useAttentionFocus();
  const { addToast } = useToast();
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litterEntries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const vaccinations = useAppSelector(selectVaccinationsByHousehold(householdId), shallowEqual);
  const preventives = useAppSelector(selectPreventivesByHousehold(householdId), shallowEqual);
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId), shallowEqual);

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
          kind: 'visit',
          severity: item.severity,
          catIds: item.catIds,
          title: visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
          subtitle: catNames(item.catIds),
          dueLabel: formatDueLabel(item.scheduledAt, now),
          actionLabel: 'Complete',
          onAction: () =>
            requestFocus({ kind: 'visit-complete', requestedAt: Date.now(), visitId: item.visitId }),
          clinic: visit.clinicId ? (clinics.find((entry) => entry.id === visit.clinicId) ?? null) : null,
          doctorName: visit.doctorId ? (doctors.find((entry) => entry.id === visit.doctorId)?.name ?? null) : null,
        };
      }
      case 'litter': {
        const box = litterBoxes.find((entry) => entry.id === item.litterBoxId);
        if (!box) return null;

        return {
          key: `litter-${item.litterBoxId}`,
          kind: 'litter',
          severity: item.severity,
          catIds: [],
          title: box.name,
          subtitle:
            item.daysSinceChange === null
              ? 'No full change logged yet'
              : `${item.daysSinceChange} day${item.daysSinceChange === 1 ? '' : 's'} since last full change`,
          dueLabel: '',
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
          kind: 'vaccination',
          severity: item.severity,
          catIds: [item.catId],
          title: vaccination.name,
          subtitle: catName(item.catId),
          dueLabel: formatDueLabel(item.expiresAt, now),
          actionLabel: 'Log vaccine',
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
          kind: 'preventive',
          severity: item.severity,
          catIds: item.catIds,
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
  const visitRows = rows.filter((row) => row.kind === 'visit');
  const otherRows = rows.filter((row) => row.kind !== 'visit');
  const {
    page: otherRowsPage,
    pageCount: otherRowsPageCount,
    setPage: setOtherRowsPage,
    pagedItems: pagedOtherRows,
    shouldPaginate: shouldPaginateOtherRows,
  } = usePagination(otherRows, OTHER_ROWS_PAGE_SIZE);

  if (rows.length === 0) {
    return null;
  }

  const renderReminderBadge = (row: AttentionRow) => {
    const label = getReminderBadgeLabel(row.severity);

    if (!label) {
      return null;
    }

    return (
      <Badge variant='destructive' outline size='xs' use='alert' className='bg-destructive/10 border-transparent'>
        {label}
      </Badge>
    );
  };

  const renderVisitStatus = (row: AttentionRow) => {
    const status = getVisitStatusText(row.severity, row.dueLabel);

    if (!status) {
      return null;
    }

    return <span className={join('text-sm', status.className)}>{status.text}</span>;
  };

  const renderRowAvatar = (row: AttentionRow, size: AvatarSize) =>
    row.kind === 'litter' ? (
      <div
        className={join(
          'border-border text-muted-foreground flex shrink-0 items-center justify-center rounded-full border',
          AVATAR_SIZE_CLASSES[size],
        )}
      >
        <Trash2 className='h-4 w-4' />
      </div>
    ) : (
      <AvatarStack
        people={row.catIds.map((catId) => {
          const cat = cats.find((entry) => entry.id === catId);
          return { id: catId, name: cat?.name ?? 'Cat', photoURL: cat?.photoURL };
        })}
        size={size}
      />
    );

  const renderClinicDetailsContent = (clinic: VetClinic, doctorName?: string | null) => {
    const copyField = async (label: string, value: string) => {
      const copied = await copyToClipboard(value);
      if (copied) {
        addToast({ title: `${label} copied`, description: `Clinic ${label.toLowerCase()} copied to your clipboard.` });
      }
    };

    return (
      <div className='w-64 space-y-2 p-3 text-sm'>
        <p className='font-medium'>{clinic.name}</p>
        {doctorName && <p className='text-muted-foreground'>Dr. {doctorName}</p>}
        {clinic.phone && (
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>{clinic.phone}</span>
            <Button type='button' variant='link' size='sm' onClick={() => void copyField('Phone', clinic.phone!)}>
              Copy
            </Button>
          </div>
        )}
        {clinic.address && (
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>{clinic.address}</span>
            <Button type='button' variant='link' size='sm' onClick={() => void copyField('Address', clinic.address!)}>
              Copy
            </Button>
          </div>
        )}
      </div>
    );
  };

  /**
   * Two different interaction patterns for the vet details, alternated across rows on purpose so
   * both are visible side by side — pending a decision on which one to keep everywhere.
   */
  const renderClinicInfo = (row: AttentionRow, pattern: 'popover' | 'disclosure') => {
    if (!row.clinic) {
      return null;
    }

    const clinic = row.clinic;

    if (pattern === 'popover') {
      return (
        <div className='mt-1'>
          <Popover
            trigger={
              <Button type='button' variant='link' size='sm' className='h-auto p-0'>
                Details
              </Button>
            }
            placement='bottom'
            alignment='start'
          >
            {renderClinicDetailsContent(clinic, row.doctorName)}
          </Popover>
        </div>
      );
    }

    return (
      <Disclosure label='Details' buttonClassName='text-primary text-sm p-0 hover:underline' className='mt-1'>
        {renderClinicDetailsContent(clinic, row.doctorName)}
      </Disclosure>
    );
  };

  const isSingleVisit = visitRows.length === 1;

  return (
    <section className='rounded-lg border border-border bg-card p-4'>
      <div className='grid gap-6 md:grid-cols-2'>
        {visitRows.length > 0 && (
          <div>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Upcoming visits</h2>
            </div>
            <div className='mt-3 space-y-3'>
              {visitRows.map((row, index) =>
                isSingleVisit ? (
                  <div key={row.key} className='rounded-lg border border-border p-4'>
                    <div className='flex items-center gap-3'>
                      {renderRowAvatar(row, 'md')}
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <p className='text-base font-semibold'>{row.title}</p>
                          {renderVisitStatus(row)}
                        </div>
                        <p className='text-muted-foreground text-sm'>
                          {row.subtitle} · {row.dueLabel}
                        </p>
                        {renderClinicInfo(row, 'popover')}
                      </div>
                    </div>
                    <Button type='button' variant='link' size='sm' onClick={row.onAction} className='mt-3 px-0'>
                      {row.actionLabel}
                    </Button>
                  </div>
                ) : (
                  <div key={row.key} className='rounded-lg border border-border p-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='flex min-w-0 items-center gap-3'>
                        {renderRowAvatar(row, 'xs')}
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <p className='text-sm font-medium'>{row.title}</p>
                            {renderVisitStatus(row)}
                          </div>
                          <p className='text-muted-foreground text-sm'>
                            {row.subtitle} · {row.dueLabel}
                          </p>
                          {renderClinicInfo(row, index % 2 === 0 ? 'popover' : 'disclosure')}
                        </div>
                      </div>
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        onClick={row.onAction}
                        className='shrink-0'
                      >
                        {row.actionLabel}
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {otherRows.length > 0 && (
          <div>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Care reminders</h2>
              <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                Take action
              </span>
            </div>
            <div className='divide-border divide-y'>
              {pagedOtherRows.map((row) => (
                <div key={row.key} className='flex items-center justify-between gap-3 py-2.5 first:pt-0'>
                  <div className='flex min-w-0 items-center gap-3'>
                    <div className='flex min-w-8 shrink-0 justify-start'>{renderRowAvatar(row, 'xs')}</div>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-medium'>{row.title}</p>
                        {renderReminderBadge(row)}
                      </div>
                      <p className='text-muted-foreground text-sm'>
                        {row.subtitle}
                        {row.dueLabel ? ` · ${row.dueLabel}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button type='button' variant='link' size='sm' onClick={row.onAction} className='shrink-0'>
                    {row.actionLabel}
                  </Button>
                </div>
              ))}
            </div>
            {shouldPaginateOtherRows && (
              <div className='mt-3 flex justify-center'>
                <Pagination
                  page={otherRowsPage}
                  pageCount={otherRowsPageCount}
                  onPageChange={setOtherRowsPage}
                  size='sm'
                  showFirstLast={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default AttentionSection;
