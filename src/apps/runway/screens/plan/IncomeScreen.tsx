import { useState } from 'react';
import { Banknote, ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import GroupTotalHelp from '@apps/runway/components/GroupTotalHelp';
import PlanTotal from '@apps/runway/components/PlanTotal';
import { usePlanTotals } from '@apps/runway/hooks/useGroupFigures';
import { describePlanTotal } from '@apps/runway/utils/billText';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { ITEM_SHEET_R2_WORDS, SCHEDULE_LABELS } from '@apps/runway/constants';
import { describeRange } from '@apps/runway/utils/rangeText';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectIsPlanItemsLoaded,
  selectResolvedPlan,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { toOrdinal } from '@apps/runway/utils/monthDays';
import type {
  Pairing,
  PayLineSealed,
  Schedule,
  SourceSealed,
  Stance,
} from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const MAX_SHOWN_NAMES = 3;

const describePattern = (schedule: Schedule) => {
  if (schedule.kind === 'monthly') {
    return `Monthly, the ${toOrdinal(schedule.monthDays[0])}`;
  }
  if (schedule.kind === 'twiceMonthly') {
    return `Twice a month, the ${schedule.monthDays.map(toOrdinal).join(' and ')}`;
  }
  return SCHEDULE_LABELS[schedule.kind];
};

const describeTiming = ({ schedule }: PayLineSealed) =>
  schedule.kind === 'once' && schedule.anchor !== null
    ? `Arrives ${formatDateShortUTC(schedule.anchor)}`
    : describePattern(schedule);

const describeEnding = ({ ending }: PayLineSealed) => {
  if (ending.afterCount !== null)
    return `Ends after ${ending.afterCount} payments`;
  if (ending.onDate !== null)
    return `Ends ${formatDateShortUTC(ending.onDate)}`;
  return null;
};

const describeFunds = (names: string[]) => {
  const shown = names.slice(0, MAX_SHOWN_NAMES).join(', ');
  const more = names.length - MAX_SHOWN_NAMES;
  return `Pays first: ${more > 0 ? `${shown} and ${more} more` : shown}`;
};

interface SourceRowProps {
  itemId: string;
  source: SourceSealed;
  funds: string[];
  payCount: number;
  today: number;
}

/** An income source as the head of its pays: its name and what it funds; it opens the source's sheet. */
function SourceRow({ itemId, source, funds, payCount, today }: SourceRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fundsLine = describeFunds(funds);
  const pays = payCount === 1 ? '1 pay' : `${payCount} pays`;
  const detail = funds.length > 0 ? fundsLine : pays;

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-10 w-full items-center justify-start gap-2 px-0! py-1 text-left font-normal whitespace-normal'
        aria-label={`${source.name}. ${detail}. Open`}
        onClick={() => setIsOpen(true)}
      >
        <span className='min-w-0 flex-1'>
          <span className='block text-lg font-semibold break-words'>
            {source.name}
          </span>
          <span className='text-muted-foreground block text-sm break-words'>
            {detail}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      {isOpen && (
        <ItemSheet
          itemId={itemId}
          kind='source'
          today={today}
          figureLabel='Income source'
          fact={funds.length > 0 ? `${pays} · ${fundsLine}` : pays}
          quickChange={{
            label: ITEM_SHEET_R2_WORDS.changeName,
            step: 'sourceName',
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

interface PayLineRowProps {
  itemId: string;
  payLine: PayLineSealed;
  planStance: Stance;
  funds: string[];
  today: number;
}

/** One pay: its name, when it arrives and its amount; it opens the pay's sheet. */
function PayLineRow({
  itemId,
  payLine,
  planStance,
  funds,
  today,
}: PayLineRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const stance = effectiveStance(planStance, payLine.stanceOverride);
  const amount = formatCents(pick(stance, payLine.amount, 'income'));
  const timing = describeTiming(payLine);

  return (
    <>
      <ItemRow
        name={payLine.name}
        detail={timing}
        figure={amount}
        ariaLabel={`${payLine.name}, ${amount}. ${timing}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <ItemSheet
          itemId={itemId}
          kind='payLine'
          today={today}
          figureLabel='Each pay'
          figure={amount}
          fact={[
            timing,
            describeEnding(payLine),
            funds.length > 0 ? describeFunds(funds) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          help={describeRange(
            payLine.amount,
            stance,
            'income',
            Boolean(payLine.stanceOverride),
          )}
          quickChange={{
            label: ITEM_SHEET_R2_WORDS.change,
            subtitle: ITEM_SHEET_R2_WORDS.changeAmountSub,
            step: 'amount',
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function IncomeScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const stance = useAppSelector(selectStance);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const total = usePlanTotals(today).income;
  const totalFigure = describePlanTotal({ kind: 'monthly', total });
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const { addRequest, clearAdd } = useRunwayUrlState();
  const [formKey, setFormKey] = useState<number | null>(null);
  const isRequested = addRequest === 'income';
  const namesOf = (pairings: readonly Pairing[] | undefined) =>
    (pairings ?? []).flatMap((pairing) => {
      const target = [...envelopes, ...bills, ...goals].find(
        ({ item }) => item.id === pairing.targetItemId,
      );
      return target ? [target.version.payload.name] : [];
    });

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your income.</p>
      );
    }
    if (sources.length === 0) {
      return (
        <EmptyCard icon={<Banknote className='h-5 w-5' />}>
          Start with where your money comes from. Each pay you add shows up as a
          coming day on Days.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-5'>
        {sources.map((source) => (
          <section key={source.item.id} className='space-y-1'>
            <SourceRow
              itemId={source.item.id}
              source={source.version.payload}
              funds={namesOf(source.version.payload.pairings)}
              payCount={source.payLines.length}
              today={today}
            />
            {source.payLines.length === 0 ? (
              <p className='text-muted-foreground text-sm'>No pay added yet.</p>
            ) : (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {source.payLines.map(({ item, version }) => (
                  <PayLineRow
                    key={item.id}
                    itemId={item.id}
                    payLine={version.payload}
                    planStance={stance}
                    funds={namesOf(version.payload.pairings)}
                    today={today}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Income'
        action={
          isLoaded && totalFigure ? (
            <PlanTotal
              figure={totalFigure}
              help={
                total.total.lowCents !== total.total.highCents ||
                total.oneTime.count > 0 ||
                total.uncounted > 0 ? (
                  <GroupTotalHelp
                    total={total}
                    hasRange={total.total.lowCents !== total.total.highCents}
                    stance={stance}
                    side='income'
                  />
                ) : undefined
              }
            />
          ) : undefined
        }
      />
      {getBody()}
      <FloatingAction
        label='Add income'
        icon={<Banknote className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {(formKey !== null || isRequested) && (
        <IncomeForm
          key={formKey ?? 'requested'}
          isOpen
          title='Income'
          defaultFrequency={null}
          onClose={() => {
            setFormKey(null);
            clearAdd();
          }}
        />
      )}
    </div>
  );
}

export default IncomeScreen;
