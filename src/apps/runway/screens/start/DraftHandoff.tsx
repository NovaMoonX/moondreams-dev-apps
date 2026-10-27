import { useState } from 'react';
import { Loader } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmptyCard from '@/components/EmptyCard';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { START_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { describeCounts } from '@apps/runway/screens/start/startRows';
import {
  commitStartDraft,
  DraftPlanNotReady,
  EMPTY_TIER_RANKS,
  type ExistingNames,
} from '@apps/runway/store/actions/draftActions';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectIsPlanItemsLoaded,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  clearStartDraft,
  type StartDraft,
} from '@apps/runway/utils/startDraft';
import type { Priority } from '@apps/runway/types';

const toTopRanks = (
  list: { version: { payload: { priority: Priority; orderIndex: number } } }[],
) =>
  list.reduce<Record<Priority, number>>(
    (acc, { version }) => ({
      ...acc,
      [version.payload.priority]: Math.max(
        acc[version.payload.priority],
        version.payload.orderIndex,
      ),
    }),
    { ...EMPTY_TIER_RANKS },
  );

/** Writes what was entered before signing in to the plan, asking first only when the plan already has items. */
function DraftHandoff({ draft }: { draft: StartDraft }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const items = useAppSelector((state) => state.runway.items);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPlanItems =
    sources.length + bills.length + envelopes.length + goals.length > 0;

  const save = async () => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    const existing: ExistingNames = {
      sources: sources.map((source) => source.version.payload.name),
      bills: bills.map(({ version }) => version.payload.name),
      envelopes: envelopes.map(({ version }) => version.payload.name),
      goals: goals.map(({ version }) => version.payload.name),
      topRanks: {
        bills: toTopRanks(bills),
        envelopes: toTopRanks(envelopes),
        goals: toTopRanks(goals),
      },
      startDate,
      itemCount: items.length,
    };
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const { added, unrecordedHoldings } = await commitStartDraft(
        user.uid,
        encryption,
        draft,
        existing,
        today,
      );
      clearStartDraft();
      addToast({
        title: START_WORDS.handoffSaved(added),
        type: 'success',
      });
      if (unrecordedHoldings.length > 0)
        addToast({
          title: START_WORDS.handoffUnrecorded(unrecordedHoldings.join(', ')),
          type: 'warning',
        });
    } catch (saveError) {
      console.error(saveError);
      setError(
        saveError instanceof DraftPlanNotReady
          ? START_WORDS.handoffNotReady
          : START_WORDS.handoffFailed,
      );
      setIsSaving(false);
    }
  };

  const counts = {
    income: draft.incomes.length,
    bill: draft.bills.length,
    envelope: draft.envelopes.length,
    goal: draft.goals.length,
  };

  if (!isLoaded) {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl py-6'>
          <EmptyCard icon={<Loader className='h-5 w-5 animate-spin' />}>
            Saving what you entered to your plan.
          </EmptyCard>
        </div>
      </div>
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-xl space-y-4 py-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>{START_WORDS.handoffTitle}</h1>
          <p className='text-muted-foreground text-sm text-pretty'>
            {START_WORDS.handoffBody(describeCounts(counts), hasPlanItems)}
          </p>
        </div>
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <div className='flex flex-col gap-2'>
          <Button loading={isSaving} onClick={() => void save()}>
            {START_WORDS.handoffAdd}
          </Button>
          <Button
            variant='secondary'
            disabled={isSaving}
            onClick={clearStartDraft}
          >
            {hasPlanItems ? START_WORDS.handoffKeep : START_WORDS.handoffDiscard}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DraftHandoff;
