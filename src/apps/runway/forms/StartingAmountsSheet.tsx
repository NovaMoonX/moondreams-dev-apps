import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import FoldedDateField from '@/components/FoldedDateField';
import FormSheet from '@/components/FormSheet';
import MoneyInput from '@/components/MoneyInput';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import SummaryEditor from '@/components/SummaryEditor';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  FORM_FLOW_WORDS,
  START_AMOUNTS_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
  START_ROWS_PREVIEW,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { collectStarted } from '@apps/runway/engine/progress';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  recordStart,
  type StartHoldingInput,
} from '@apps/runway/store/actions/moveActions';
import {
  selectBills,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

interface StartingAmountsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Drawn as the page's own content, for a screen that is already a full page, instead of a sheet over it. */
  isInline?: boolean;
  /** Called once the amounts are saved. */
  onSaved?: () => void;
}

interface AmountRow {
  id: string;
  name: string;
}

interface AmountListProps {
  label: string;
  rows: AmountRow[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
}

/** One-line rows that each open their own amount, capped so fifty of them stay a short list. */
export function AmountList({ label, rows, values, onChange }: AmountListProps) {
  const [isAll, setIsAll] = useState(false);
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const matches =
    text === ''
      ? rows
      : rows.filter((row) => row.name.toLowerCase().includes(text));
  const shown =
    isAll || text !== '' ? matches : matches.slice(0, START_ROWS_PREVIEW);
  const hiddenCount = rows.length - START_ROWS_PREVIEW;

  if (rows.length === 0) return null;
  return (
    <div className='space-y-2'>
      <SectionDivider label={label} />
      {rows.length >= RUNWAY_SEARCH_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${label.toLowerCase()}`}
        />
      )}
      <div className='space-y-2'>
        {shown.map((row) => {
          const cents = parseMoneyToCents(values[row.id] ?? '');
          return (
            <SummaryEditor
              key={row.id}
              label={row.name}
              summary={cents === null ? '' : formatCents(cents)}
              placeholder='Add an amount'
              title={row.name}
              isFramed
              shouldFocus
            >
              <MoneyInput
                variant='outline'
                ariaLabel={`${row.name} amount`}
                value={values[row.id] ?? ''}
                onChange={(value) => onChange(row.id, value)}
                placeholder='0.00'
              />
            </SummaryEditor>
          );
        })}
      </div>
      {text !== '' && matches.length === 0 && (
        <p className='text-muted-foreground text-sm'>Nothing matches that.</p>
      )}
      {text === '' && hiddenCount > 0 && (
        <ShowMoreButton
          isOpen={isAll}
          onClick={() => setIsAll((open) => !open)}
        >
          {isAll ? 'Show fewer' : `Show all ${rows.length}`}
        </ShowMoreButton>
      )}
    </div>
  );
}

/** Where things stand today: the starting day, the money on hand, what each goal holds and what is already set aside for each bill. Saving again appends newer amounts. */
function StartingAmountsSheet({
  isOpen,
  onClose,
  isInline = false,
  onSaved,
}: StartingAmountsSheetProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate(useNow(60_000));
  const plan = useAppSelector((state) => state.runway.plan);
  const moves = useAppSelector((state) => state.runway.moves);
  const goals = useAppSelector((state) => selectGoals(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));

  const started = collectStarted(moves, plan?.startDate ?? null);
  const toText = (cents: number | undefined) =>
    cents === undefined ? '' : (cents / 100).toFixed(2);
  const [date, setDate] = useState(toDateInputValue(plan?.startDate ?? today));
  const [money, setMoney] = useState(toText(started.money ?? undefined));
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(started.byItem).map(([id, cents]) => [id, toText(cents)]),
    ),
  );
  const askedGoals = goals.filter(
    ({ item, version }) =>
      started.byItem[item.id] === undefined &&
      (version.payload.startingCents ?? null) === null,
  );
  const carriedGoals = goals.flatMap(({ item, version }) =>
    started.byItem[item.id] === undefined &&
    (version.payload.startingCents ?? 0) > 0
      ? [{ id: item.id, cents: version.payload.startingCents ?? 0 }]
      : [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = JSON.stringify({ date, money, amounts });
  const [startSnapshot] = useState(snapshot);
  const requestClose = useDiscardGuard({
    isDirty: snapshot !== startSnapshot,
    onClose,
    isBusy: isSaving,
    title: FORM_FLOW_WORDS.discardChange,
  });

  const startDate = fromDateInputValue(date) ?? null;
  const getHoldings = (): StartHoldingInput[] => {
    const toHolding = (
      holding: 'goal' | 'bill',
      id: string,
    ): StartHoldingInput[] => {
      const cents = parseMoneyToCents(amounts[id] ?? '');
      if (cents === null) {
        return started.byItem[id] === undefined
          ? []
          : [{ holding, refId: id, amountCents: 0 }];
      }
      return [{ holding, refId: id, amountCents: cents }];
    };
    const moneyCents = parseMoneyToCents(money);
    return [
      ...(moneyCents === null
        ? []
        : [
            { holding: 'money' as const, refId: null, amountCents: moneyCents },
          ]),
      ...askedGoals.flatMap(({ item }) => toHolding('goal', item.id)),
      ...carriedGoals.map(({ id, cents }) => ({
        holding: 'goal' as const,
        refId: id,
        amountCents: cents,
      })),
      ...bills.flatMap(({ item }) => toHolding('bill', item.id)),
    ];
  };
  const holdings = getHoldings();
  const note =
    startDate === null || startDate > today
      ? 'Pick today or an earlier day.'
      : holdings.length === 0
        ? 'Add at least one amount, or choose Later.'
        : null;

  const save = async () => {
    if (!user || startDate === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await recordStart(user.uid, encryption, startDate, holdings);
      onSaved?.();
      onClose();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? START_AMOUNTS_WORDS.offline
          : getErrorMessage(
              saveError,
              'That did not save. Nothing was changed.',
            ),
      );
      setIsSaving(false);
    }
  };

  const content = (
    <div className='grid gap-4'>
      <AmountHero
        label={FORM_FLOW_WORDS.moneyOnHand}
        value={money}
        onChange={setMoney}
        hint='What you have to plan with.'
      />
      <FoldedDateField
        label={FORM_FLOW_WORDS.asOf}
        value={date}
        onChange={setDate}
        todayValue={toDateInputValue(today)}
        max={toDateInputValue(today)}
      />
      <AmountList
        label='What each goal holds'
        rows={askedGoals.map(({ item, version }) => ({
          id: item.id,
          name: version.payload.name,
        }))}
        values={amounts}
        onChange={(id, value) =>
          setAmounts((current) => ({ ...current, [id]: value }))
        }
      />
      <AmountList
        label='Already set aside for bills'
        rows={bills.map(({ item, version }) => ({
          id: item.id,
          name: version.payload.name,
        }))}
        values={amounts}
        onChange={(id, value) =>
          setAmounts((current) => ({ ...current, [id]: value }))
        }
      />
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      <ModalFooterActions
        note={note}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || note !== null}
            onClick={() => void save()}
          >
            Save
          </Button>
        }
      />
    </div>
  );

  if (isInline) return content;
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title='Where things stand'
    >
      {content}
    </FormSheet>
  );
}

export default StartingAmountsSheet;
