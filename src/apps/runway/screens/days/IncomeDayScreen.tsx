import { useState } from 'react';
import { Mail } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import RangeNote from '@apps/runway/components/RangeNote';
import CoverageHeadline from '@apps/runway/components/CoverageHeadline';
import DraftLine from '@apps/runway/components/DraftLine';
import FundsRow from '@apps/runway/components/FundsRow';
import { DRAFT_WORDS } from '@apps/runway/constants';
import PairingsEditor from '@apps/runway/forms/PairingsEditor';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  EMPTY_OVERRIDE,
  saveDayOverride,
} from '@apps/runway/store/actions/dayActions';
import { getErrorMessage } from '@/utils/errorUtils';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import { effectiveStance } from '@apps/runway/engine/stance';
import type { HoldChoice } from '@apps/runway/types';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectDraft,
  selectIsDaysLoaded,
  selectIsPlanItemsLoaded,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

interface IncomeDayScreenProps {
  dayKey: string;
  onClose: () => void;
}

/** What one coming income day does with its money, worked out each time and never stored. */
function IncomeDayScreen({ dayKey, onClose }: IncomeDayScreenProps) {
  const { user } = useAuth();
  const [isEditingFunds, setIsEditingFunds] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayAsUtcDate(useNow(60_000));
  const isPlanLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isLoaded = isPlanLoaded && isDaysLoaded;
  const view = useAppSelector((state) => selectDraft(state, dayKey, today));
  const planStance = useAppSelector(selectStance);

  if (!view || !isDaysLoaded) {
    return (
      <Subview title='Income day' onClose={onClose}>
        <p className='text-muted-foreground text-sm'>
          {isLoaded ? 'This income day is not coming up.' : 'Getting this day.'}
        </p>
      </Subview>
    );
  }

  const { day, draft, items, sourceNames, override, inheritedPairings } = view;
  const heldLines = draft.lines.filter(
    (line) => line.pairing?.state === 'held',
  );
  const effectivePairings = override?.pairings ?? inheritedPairings;
  const hasChanges =
    override !== null &&
    (override.pairings !== null ||
      Object.keys(override.holdResolutions).length > 0);

  const persist = async (
    change: (current: typeof EMPTY_OVERRIDE) => typeof EMPTY_OVERRIDE,
  ) => {
    if (!user) return;
    const encryption = await getRunwayEncryption(user.uid);
    await saveDayOverride(
      user.uid,
      encryption,
      { payLineId: day.payLineId, sourceId: day.sourceId, expectedOn: day.on },
      change,
    );
  };
  const save = async (
    change: (current: typeof EMPTY_OVERRIDE) => typeof EMPTY_OVERRIDE,
  ) => {
    setError(null);
    setIsSaving(true);
    try {
      await persist(change);
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      setIsSaving(false);
    }
  };
  const choose = (line: DraftLineData, choice: HoldChoice) =>
    save((current) => ({
      ...current,
      holdResolutions: { ...current.holdResolutions, [line.itemId]: choice },
    }));
  const funded = draft.lines.filter((line) => line.shortBy === 0);
  const unfunded = draft.lines.filter((line) => line.shortBy > 0);
  const title = day.sourceName ?? day.payLineName;

  const renderLine = (line: (typeof draft.lines)[number]) => {
    const envelope = Object.hasOwn(items, line.itemId)
      ? items[line.itemId]
      : {
          name: line.bill ? DRAFT_WORDS.billFallback : 'Envelope',
          emoji: null,
        };
    return (
      <DraftLine
        key={line.lineId}
        line={line}
        name={envelope.name}
        emoji={envelope.emoji}
        sourceNames={sourceNames}
        onChoose={choose}
        isChoosing={isSaving}
      />
    );
  };

  return (
    <Subview title='Income day' onClose={onClose}>
      <div className='space-y-4'>
        <div>
          <p className='line-clamp-2 text-lg font-medium break-words'>
            {title}
          </p>
          <p className='text-muted-foreground text-sm'>
            {formatDateUTC(day.on)}
            <span className='max-sm:hidden'> · </span>
            <span className='max-sm:block'>
              {formatCents(draft.moneyCents)}
            </span>
          </p>
          <RangeNote
            range={day.amount}
            stance={effectiveStance(planStance, day.stanceOverride)}
            side='income'
            isOwnStance={Boolean(day.stanceOverride)}
          />
        </div>
        <div>
          <FundsRow
            names={effectivePairings.flatMap((pairing) =>
              Object.hasOwn(items, pairing.targetItemId)
                ? [items[pairing.targetItemId].name]
                : [],
            )}
            ariaLabel='What this day funds'
            onOpen={() => setIsEditingFunds(true)}
          />
          {hasChanges && (
            <Button
              type='button'
              variant='secondary'
              disabled={isSaving}
              onClick={() => void save(() => EMPTY_OVERRIDE)}
            >
              {DRAFT_WORDS.useThePlan}
            </Button>
          )}
        </div>
        {heldLines.length > 0 && (
          <p className='bg-accent border-border rounded-2xl border p-3 text-sm'>
            {DRAFT_WORDS.holdsBlock}
          </p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <CoverageHeadline
          freeCents={draft.freeToSpend.cents}
          moneyCents={draft.moneyCents}
        />
        {draft.lines.length === 0 ? (
          <EmptyCard icon={<Mail className='h-5 w-5' />}>
            Nothing is set to be funded from this day. Add an envelope or a bill
            in Plan and it will show here.
          </EmptyCard>
        ) : (
          <div className='space-y-4'>
            {funded.length > 0 && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {funded.map(renderLine)}
              </ul>
            )}
            {unfunded.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider label={DRAFT_WORDS.notFunded} />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {unfunded.map(renderLine)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {isEditingFunds && (
        <PairingsEditor
          isOpen
          title='Funds'
          fromLabel={title}
          locked={[]}
          initial={effectivePairings}
          onClose={() => setIsEditingFunds(false)}
          onSave={(pairings) =>
            persist((current) => ({ ...current, pairings }))
          }
        />
      )}
    </Subview>
  );
}

export default IncomeDayScreen;
