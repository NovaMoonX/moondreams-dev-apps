import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, History, ListFilter } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import EmptyCard from '@/components/EmptyCard';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import SummaryEditor from '@/components/SummaryEditor';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import ChangeRow from '@apps/runway/components/ChangeRow';
import {
  CHANGE_LOG_PAGE_SIZE,
  CHANGE_LOG_SPANS,
  CHANGE_LOG_SPAN_LABELS,
  MAX_CHANGE_LOG_PAGE,
  MAX_WINDOW_CHANGES,
} from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import RecordScreen from '@apps/runway/screens/days/RecordScreen';
import { selectItemNames } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenChange, OpenDay } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  getChangeWindow,
  toChangeWindowKey,
} from '@apps/runway/utils/changeWindow';

interface ChangeLogScreenProps {
  onClose: () => void;
}

const ALL_ITEMS = 'all';
const spanOptions = CHANGE_LOG_SPANS.map((value) => ({
  value,
  label: CHANGE_LOG_SPAN_LABELS[value],
}));

/** The earliest income day confirmed after the change was made, on or after the day the change starts from. */
const findConfirmedDay = (change: OpenChange, confirmed: OpenDay[]) => {
  if (change.effectiveFrom === null) return null;
  const effectiveFrom = change.effectiveFrom;
  const found = confirmed.find(
    (day) =>
      day.expectedOn >= effectiveFrom &&
      (day.confirmedAt ?? 0) > change.createdAt,
  );
  return found?.id ?? null;
};

/** Every change to the plan in one window of dates, newest first, with the person's reason; search covers the window in view only. */
function ChangeLogScreen({ onClose }: ChangeLogScreenProps) {
  const { logSpan, logPage, logItem, setLogSpan, setLogPage, setLogItem } =
    useRunwayUrlState();
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(CHANGE_LOG_PAGE_SIZE);
  const [recordKey, setRecordKey] = useState<string | null>(null);
  const itemNames = useAppSelector(selectItemNames);
  const changes = useAppSelector((state) => state.runway.changes);
  const changesFor = useAppSelector((state) => state.runway.changesFor);
  const failedFor = useAppSelector((state) => state.runway.changesFailedFor);
  const days = useAppSelector((state) => state.runway.days);

  const window = getChangeWindow(todayAsUtcDate(), Number(logSpan), logPage);
  const windowKey = toChangeWindowKey(window, logItem);
  const isFailed = failedFor === windowKey;
  const isLoaded = changesFor === windowKey;
  const itemName = itemNames.find((item) => item.id === logItem)?.name ?? null;

  const confirmed = useMemo(
    () =>
      days
        .filter((day) => day.status === 'confirmed')
        .sort((a, b) => a.expectedOn - b.expectedOn),
    [days],
  );
  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      !isLoaded || needle === ''
        ? changes
        : changes.filter((change) =>
            `${change.summary} ${change.note ?? ''}`
              .toLowerCase()
              .includes(needle),
          ),
    [changes, isLoaded, needle],
  );
  const itemOptions = [
    { value: ALL_ITEMS, label: 'All items' },
    ...itemNames.map((item) => ({ value: item.id, label: item.name })),
  ];
  const range = `${formatDateUTC(window.from)} to ${formatDateUTC(window.to - DAY_MS)}`;

  const getBody = () => {
    if (isFailed) {
      return (
        <p className='text-muted-foreground text-sm'>
          The change log did not load. Nothing was changed.
        </p>
      );
    }
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting the changes.</p>
      );
    }
    if (changes.length === 0) {
      return (
        <EmptyCard icon={<History className='h-5 w-5' />}>
          {itemName
            ? `No changes to ${itemName} from ${range}.`
            : `No changes from ${range}.`}
        </EmptyCard>
      );
    }
    if (visible.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          Nothing in {range} matches that. Search covers only the window shown.
        </p>
      );
    }
    return (
      <div className='space-y-2'>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {visible.slice(0, shown).map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              confirmedDayKey={findConfirmedDay(change, confirmed)}
              onOpenRecord={setRecordKey}
            />
          ))}
        </ul>
        {visible.length > shown && (
          <ShowMoreButton
            onClick={() => setShown(shown + CHANGE_LOG_PAGE_SIZE)}
          >
            Show more ({visible.length - shown} left)
          </ShowMoreButton>
        )}
        {changes.length >= MAX_WINDOW_CHANGES && (
          <p className='text-muted-foreground text-sm'>
            This window has more than {MAX_WINDOW_CHANGES} changes; the newest
            are shown. Pick a shorter window to see the rest.
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <Subview title='Change log' onClose={onClose}>
        <div className='space-y-4'>
          <PillGroup
            label='Window'
            isThin
            options={spanOptions}
            value={logSpan}
            onChange={setLogSpan}
          />
          <div className='border-border bg-card rounded-2xl border'>
            <SummaryEditor
              label='Item'
              summary={itemName ?? ''}
              placeholder='All items'
              title='Item'
              icon={<ListFilter />}
              isFramed
              shouldFocus={false}
            >
              <PillGroup
                label='Item'
                options={itemOptions}
                value={logItem ?? ALL_ITEMS}
                onChange={(value) => {
                  setShown(CHANGE_LOG_PAGE_SIZE);
                  setLogItem(value === ALL_ITEMS ? null : value);
                }}
              />
            </SummaryEditor>
          </div>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm font-medium'>{range}</p>
            <ActionChips
              label='Move the window'
              actions={[
                ...(logPage > 0
                  ? [
                      {
                        key: 'newer',
                        icon: <ChevronRight className='h-4 w-4' />,
                        label: 'Newer',
                        onClick: () => setLogPage(logPage - 1),
                      },
                    ]
                  : []),
                ...(logPage < MAX_CHANGE_LOG_PAGE
                  ? [
                      {
                        key: 'older',
                        icon: <ChevronLeft className='h-4 w-4' />,
                        label: 'Older',
                        onClick: () => setLogPage(logPage + 1),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {isLoaded && changes.length >= 8 && (
            <div className='space-y-1'>
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setShown(CHANGE_LOG_PAGE_SIZE);
                }}
                placeholder='Search this window'
              />
              <p className='text-muted-foreground text-xs'>
                Search covers only the changes in this window. Entries are
                sealed, so older windows are read one at a time.
              </p>
            </div>
          )}
          {getBody()}
        </div>
      </Subview>
      {recordKey !== null && (
        <RecordScreen dayKey={recordKey} onClose={() => setRecordKey(null)} />
      )}
    </>
  );
}

export default ChangeLogScreen;
