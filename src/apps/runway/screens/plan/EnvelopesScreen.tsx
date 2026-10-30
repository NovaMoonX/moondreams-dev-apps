import { useState } from 'react';
import { Wallet } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import StoppedHoldingList from '@apps/runway/components/StoppedHoldingList';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { GROUP_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import GroupHeading from '@apps/runway/components/GroupHeading';
import GroupSheet from '@apps/runway/forms/GroupSheet';
import { useGroupFigures } from '@apps/runway/hooks/useGroupFigures';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import {
  selectEnvelopes,
  selectPairedBy,
  selectIsPlanItemsLoaded,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describePairedBy } from '@apps/runway/utils/fundingText';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';

const TIP_MIN_ROWS = 3;

function EnvelopesScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const balances = useAppSelector(selectBalances);
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const figuresByGroup = useGroupFigures(today);

  const hasSearch = envelopes.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const groupIds = new Set(figuresByGroup.map(({ id }) => id));
  const isShown = ({ version }: (typeof envelopes)[number]) =>
    version.payload.name.toLowerCase().includes(needle);
  const visible = envelopes.filter(isShown);
  const sections = figuresByGroup
    .map((figures) => ({
      figures,
      rows: figures.envelopes.filter(isShown),
    }))
    .filter(({ rows }) => rows.length > 0);
  const ungrouped = visible.filter(
    ({ version }) =>
      version.payload.groupId === null ||
      !groupIds.has(version.payload.groupId),
  );
  const isShowingTip =
    envelopes.length >= TIP_MIN_ROWS &&
    figuresByGroup.every(
      ({ bills, envelopes: inGroup }) => bills.length + inGroup.length === 0,
    );

  const getList = (rows: typeof envelopes) => (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map(({ item, version }) => (
        <EnvelopeTile
          key={item.id}
          itemId={item.id}
          envelope={version.payload}
          cents={balances.assignedByItem[item.id] ?? 0}
          pairedNote={describePairedBy(pairedBy[item.id] ?? [])}
          today={today}
        />
      ))}
    </ul>
  );

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your envelopes.</p>
      );
    }
    if (envelopes.length === 0) {
      return (
        <EmptyCard icon={<Wallet className='h-5 w-5' />}>
          An envelope is spending with no due date, like groceries or gas. Add
          one and say how often it gets money.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search envelopes'
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            No envelope matches that.
          </p>
        ) : (
          <>
            {sections.map(({ figures, rows }) => (
              <div key={figures.id} className='space-y-2'>
                <GroupHeading
                  figures={figures}
                  onOpen={() => setOpenGroupId(figures.id)}
                />
                {rows.length > 0 && getList(rows)}
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div className='space-y-2'>
                {sections.length > 0 && (
                  <SectionDivider label={GROUP_WORDS.ungroupedEnvelopes} />
                )}
                {getList(ungrouped)}
              </div>
            )}
          </>
        )}
        {isShowingTip && (
          <p className='text-muted-foreground text-sm'>{GROUP_WORDS.setTip}</p>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader title='Envelopes' />
      {getBody()}
      {isLoaded && <StoppedHoldingList kind='envelope' today={today} />}
      <FloatingAction
        label='Add an envelope'
        icon={<Wallet className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {openGroupId !== null && (
        <GroupSheet
          groupId={openGroupId}
          today={today}
          onClose={() => setOpenGroupId(null)}
        />
      )}
      {formKey !== null && (
        <EnvelopeForm
          key={formKey}
          isOpen
          title='Envelope'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default EnvelopesScreen;
