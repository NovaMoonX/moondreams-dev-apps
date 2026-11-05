import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { HORIZON_END_WORDS } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getBringableCents,
  listCostPayments,
  listOpenCosts,
  setHorizonState,
} from '@apps/runway/engine/horizon';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  bringBackHorizon,
  undoHorizonState,
  type HorizonStateWritten,
} from '@apps/runway/store/actions/horizonActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import {
  selectAllHorizonItems,
  selectCostPaid,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonSealed, Stance } from '@apps/runway/types';
import { describeCost, describeCostWhen } from '@apps/runway/utils/horizonText';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

type Answer = 'bring' | 'start';

interface HorizonBringBackViewProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  onBack: () => void;
  onClose: () => void;
}

/** The view a called-off event's sheet swaps in to bring it back: which costs plan again, the question about the money it sent away when some can return, and what the pays carry for that answer. */
function HorizonBringBackView({
  itemId,
  horizon,
  today,
  stance,
  onBack,
  onClose,
}: HorizonBringBackViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const balances = useAppSelector(selectBalances);
  const paid = useAppSelector(selectCostPaid)[itemId];
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const sent = horizon.stateMoney;
  const isSentAway = sent !== null && sent.kind !== 'held' && sent.cents > 0;
  const placeName =
    sent?.kind === 'place'
      ? ([...envelopes, ...goals].find(({ item }) => item.id === sent.toId)
          ?.version.payload.name ?? null)
      : null;
  const getAvailable = (live: typeof balances) => {
    return sent?.kind === 'place'
      ? (live.assignedByItem[sent.toId ?? ''] ?? 0)
      : live.freeToSpendCents;
  };
  const availableCents = Math.max(0, getAvailable(balances));
  const bringableCents = getBringableCents(sent, availableCents);
  const isAsked = isSentAway && bringableCents > 0;
  const bringCents = answer === 'bring' ? bringableCents : 0;
  const reopened = setHorizonState(horizon, 'open', today, null);
  const comes = listOpenCosts(reopened, today, stance, paid).map((cost) => {
    const next = listCostPayments(
      cost,
      today + 400 * DAY_MS,
      stance,
      paid,
    ).find((payment) => payment.paid === null);
    return { cost, isDue: next !== undefined && next.dueOn <= today };
  });

  const placeWords = placeName ?? HORIZON_END_WORDS.anotherPlace;
  const options = [
    {
      value: 'bring' as const,
      title: mask(HORIZON_END_WORDS.bringYes(formatCents(bringableCents))),
      body:
        sent?.kind === 'place'
          ? HORIZON_END_WORDS.bringYesPlace(placeWords)
          : HORIZON_END_WORDS.bringYesFree,
    },
    {
      value: 'start' as const,
      title: HORIZON_END_WORDS.bringNo(horizon.name),
      body:
        sent?.kind === 'place'
          ? HORIZON_END_WORDS.bringNoPlace(placeWords)
          : HORIZON_END_WORDS.bringNoFree,
    },
  ];
  const isAnswered = !isAsked || answer !== null;
  const blocker = isAnswered ? null : HORIZON_END_WORDS.needsAnswer;

  const changeJson = isAnswered
    ? JSON.stringify({
        kind: 'version',
        version: {
          itemId,
          kind: 'horizon',
          effectiveFrom: today,
          effectiveUntil: null,
          changeId: 'what-if',
          payload: reopened,
        },
        move:
          bringCents > 0 && sent !== null
            ? {
                fromId: sent.kind === 'place' ? sent.toId : null,
                toId: itemId,
                cents: bringCents,
              }
            : undefined,
      } satisfies PreviewChange)
    : null;

  const getLive = () =>
    selectAllHorizonItems(store.getState(), todayAsUtcDate()).find(
      ({ item }) => item.id === itemId,
    )?.version ?? null;

  const undo = async (written: HorizonStateWritten) => {
    const live = getLive();
    if (!user || live === null || live.id !== written.versionId) {
      addToast({ title: HORIZON_END_WORDS.changedSince, type: 'error' });
      return;
    }
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoHorizonState(
        user.uid,
        encryption,
        written,
        HORIZON_END_WORDS.undoBringBackSummary(
          horizon.name,
          written.before.state === 'finished' ? 'finished' : 'calledOff',
        ),
        todayAsUtcDate(),
      );
    } catch (undoError) {
      addToast({
        title: HORIZON_END_WORDS.releaseFailed(horizon.name),
        description: getErrorMessage(undoError, HORIZON_END_WORDS.failed),
        type: 'error',
      });
    }
  };

  const save = async () => {
    if (isSavingRef.current || !user || !isAnswered) return;
    if (!navigator.onLine) {
      setError(HORIZON_END_WORDS.offline);
      return;
    }
    const found = getLive();
    const live = found?.payload ?? null;
    if (found === null || live === null || live.state === 'open') {
      setError(HORIZON_END_WORDS.alreadyDone);
      return;
    }
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await bringBackHorizon(user.uid, encryption, {
        itemId,
        horizon: live,
        baseVersionId: found.id,
        today,
        bringCents,
        availableCents: Math.max(
          0,
          getAvailable(selectBalances(store.getState())),
        ),
      });
      if (written === null) {
        setError(HORIZON_END_WORDS.alreadyDone);
        return;
      }
      addToast({
        title: mask(HORIZON_END_WORDS.backIn(live.name)),
        type: 'success',
        action: {
          label: HORIZON_END_WORDS.undo,
          onClick: () => void undo(written),
        },
      });
      onClose();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? HORIZON_END_WORDS.offline
          : getErrorMessage(saveError, HORIZON_END_WORDS.failed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink label={horizon.name} onBack={onBack} />
      <div className='space-y-1'>
        <ActionTitle>
          {HORIZON_END_WORDS.bringBackTitle(horizon.name)}
        </ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {HORIZON_END_WORDS.bringBackNote}
        </p>
      </div>
      <ActionSection caption={HORIZON_END_WORDS.whatComesBack}>
        {comes.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {HORIZON_END_WORDS.nothingComesBack}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {comes.map(({ cost, isDue }) => (
              <li
                key={cost.id}
                className='flex items-baseline justify-between gap-3 px-3 py-2 text-sm'
              >
                <span className='min-w-0 break-words'>
                  <MaskedText>
                    {HORIZON_END_WORDS.stopsRow(
                      cost.name,
                      describeCostWhen(cost.schedule, cost.ending),
                      cost.schedule.kind === 'once'
                        ? describeCost(cost).figure
                        : null,
                    )}
                  </MaskedText>
                </span>
                {isDue && (
                  <span className='text-primary shrink-0 font-medium'>
                    {HORIZON_END_WORDS.dueNow}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ActionSection>
      {isSentAway && bringableCents === 0 && (
        <p className='text-muted-foreground text-sm'>
          <MaskedText>
            {HORIZON_END_WORDS.moneyGone(
              formatCents(sent.cents),
              sent.kind === 'place' ? placeWords : 'Free to Spend',
              horizon.name,
            )}
          </MaskedText>
        </p>
      )}
      {isAsked && (
        <ActionSection
          caption={mask(
            HORIZON_END_WORDS.bringQuestion(
              formatCents(bringableCents),
              horizon.name,
            ),
          )}
        >
          <ChoiceCards options={options} value={answer} onChange={setAnswer} />
        </ActionSection>
      )}
      {changeJson !== null && (
        <EffectPreview
          changeJson={changeJson}
          emptyText=''
          isCompact
          lead={
            bringCents > 0 && sent?.kind === 'free' ? (
              <p className='text-sm'>
                <MaskedText>
                  {HORIZON_END_WORDS.freeDown(formatCents(bringCents))}
                </MaskedText>
              </p>
            ) : null
          }
        />
      )}
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void save()}
          >
            {HORIZON_END_WORDS.bringBackConfirm}
          </Button>
        }
      />
    </div>
  );
}

export default HorizonBringBackView;
