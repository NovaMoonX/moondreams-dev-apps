import { useState } from 'react';
import { Banknote } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import RangeNote from '@apps/runway/components/RangeNote';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import FundsRow from '@apps/runway/components/FundsRow';
import PairingsEditor from '@apps/runway/forms/PairingsEditor';
import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { setPairings } from '@apps/runway/store/actions/itemActions';
import { SCHEDULE_LABELS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectIsPlanItemsLoaded,
  selectResolvedPlan,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  Pairing,
  PayLineSealed,
  Schedule,
  SourceSealed,
} from '@apps/runway/types';

const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });
const ORDINAL_SUFFIXES: Record<string, string> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
  other: 'th',
};
const toOrdinal = (day: number) =>
  `${day}${ORDINAL_SUFFIXES[ordinalRules.select(day)]}`;

const describePattern = (schedule: Schedule) => {
  if (schedule.kind === 'monthly') {
    return `Monthly, the ${toOrdinal(schedule.monthDays[0])}`;
  }
  if (schedule.kind === 'twiceMonthly') {
    return `Twice a month, the ${schedule.monthDays.map(toOrdinal).join(' and ')}`;
  }
  return SCHEDULE_LABELS[schedule.kind];
};

const describeTiming = ({ schedule, ending }: PayLineSealed) => {
  if (schedule.kind === 'once' && schedule.anchor !== null) {
    return `Arrives ${formatDateUTC(schedule.anchor)}`;
  }
  const pattern = describePattern(schedule);
  if (ending.afterCount !== null)
    return `${pattern} · Ends after ${ending.afterCount} payments`;
  if (ending.onDate !== null)
    return `${pattern} · Ends ${formatDateUTC(ending.onDate)}`;
  return pattern;
};

interface EditingFunds {
  itemId: string;
  kind: 'source' | 'payLine';
  name: string;
  current: SourceSealed | PayLineSealed;
}

function IncomeScreen() {
  const { user } = useAuth();
  const today = todayAsUtcDate(useNow(60_000));
  const stance = useAppSelector(selectStance);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [editing, setEditing] = useState<EditingFunds | null>(null);
  const namesOf = (pairings: Pairing[]) =>
    pairings.flatMap((pairing) => {
      const target = [...envelopes, ...bills, ...goals].find(
        ({ item }) => item.id === pairing.targetItemId,
      );
      return target ? [target.version.payload.name] : [];
    });
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const [formKey, setFormKey] = useState<number | null>(null);

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
      <ul className='space-y-3'>
        {sources.map((source) => (
          <li
            key={source.item.id}
            className='border-border bg-card rounded-2xl border p-4'
          >
            <h3 className='line-clamp-2 font-medium break-words'>
              {source.version.payload.name}
            </h3>
            <FundsRow
              names={namesOf(source.version.payload.pairings)}
              ariaLabel={`What ${source.version.payload.name} funds`}
              onOpen={() =>
                setEditing({
                  itemId: source.item.id,
                  kind: 'source',
                  name: source.version.payload.name,
                  current: source.version.payload,
                })
              }
            />
            {source.payLines.length === 0 ? (
              <p className='text-muted-foreground mt-1 text-sm'>
                No pay added yet.
              </p>
            ) : (
              <ul className='divide-border mt-2 divide-y'>
                {source.payLines.map(({ item, version }) => {
                  return (
                    <li
                      key={item.id}
                      className='space-y-0.5 py-2 first:pt-0 last:pb-0'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <p className='min-w-0 break-words'>
                          {version.payload.name}
                        </p>
                        <p className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
                          {formatCents(
                            pick(
                              effectiveStance(
                                stance,
                                version.payload.stanceOverride,
                              ),
                              version.payload.amount,
                              'income',
                            ),
                          )}
                        </p>
                      </div>
                      <RangeNote
                        range={version.payload.amount}
                        stance={effectiveStance(
                          stance,
                          version.payload.stanceOverride,
                        )}
                        side='income'
                        isOwnStance={Boolean(version.payload.stanceOverride)}
                      />
                      <p className='text-muted-foreground text-sm'>
                        {describeTiming(version.payload)}
                      </p>
                      <FundsRow
                        names={namesOf(version.payload.pairings)}
                        ariaLabel={`What ${version.payload.name} funds`}
                        onOpen={() =>
                          setEditing({
                            itemId: item.id,
                            kind: 'payLine',
                            name: version.payload.name,
                            current: version.payload,
                          })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Income'
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + Add income
          </Button>
        }
      />
      {getBody()}
      {editing !== null && user && (
        <PairingsEditor
          key={editing.itemId}
          isOpen
          title='Funds'
          fromLabel={editing.name}
          locked={editing.current.pairings}
          initial={[]}
          onClose={() => setEditing(null)}
          onSave={async (added) => {
            const encryption = await getRunwayEncryption(user.uid);
            await setPairings(user.uid, encryption, {
              itemId: editing.itemId,
              kind: editing.kind,
              name: editing.name,
              current: editing.current,
              pairings: [...editing.current.pairings, ...added],
              startDate: today,
            });
          }}
        />
      )}
      {formKey !== null && (
        <IncomeForm
          key={formKey}
          isOpen
          title='Income'
          defaultFrequency={null}
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default IncomeScreen;
