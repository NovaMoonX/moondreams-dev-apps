import { useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import SuggestionChips from '@/components/SuggestionChips';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import EffectPreview from '@apps/runway/components/EffectPreview';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CHANGE_REASON_CHIPS,
  CHANGE_WORDS,
  HELD_WORDS,
  HORIZON_END_WORDS,
  LIFECYCLE_WORDS,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  listMadeBills,
  listOpenCosts,
  setHorizonState,
} from '@apps/runway/engine/horizon';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  callOffHorizon,
  finishHorizon,
  undoHorizonState,
  type HorizonStateWritten,
  type HorizonWhere,
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
import { describeCostWhen, describeCost } from '@apps/runway/utils/horizonText';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

type Choice = 'free' | 'keep' | 'place' | null;

interface HorizonEndViewProps {
  itemId: string;
  horizon: HorizonSealed;
  /** Finishing asks only about the money; calling off also names what stops and why. */
  mode: 'finish' | 'callOff';
  today: number;
  stance: Stance;
  onBack: () => void;
  onClose: () => void;
}

/** The view an event's sheet swaps in to finish it or call it off: what stops (calling off), where the money it holds goes, and, for calling off, why. */
function HorizonEndView({
  itemId,
  horizon,
  mode,
  today,
  stance,
  onBack,
  onClose,
}: HorizonEndViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const emojiOf = useLiveEmojiResolver();
  const balances = useAppSelector(selectBalances);
  const paid = useAppSelector(selectCostPaid)[itemId];
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [pick, setPick] = useState<Choice>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const isCallOff = mode === 'callOff';
  const leftCents = Math.max(0, balances.assignedByItem[itemId] ?? 0);
  const holdsMoney = leftCents > 0;
  const stops = isCallOff ? listOpenCosts(horizon, today, stance, paid) : [];
  const bills = isCallOff ? listMadeBills(horizon) : [];

  const places: (PillOption<string> & { name: string })[] = [
    ...envelopes.map(({ item, version }) => ({
      value: item.id,
      name: version.payload.name,
      label: version.payload.name,
      emoji:
        emojiOf(version.payload.emoji, version.payload.groupId) ?? undefined,
    })),
    ...goals
      .filter(({ version }) => version.payload.state !== 'paused')
      .map(({ item, version }) => ({
        value: item.id,
        name: version.payload.name,
        label: version.payload.name,
        emoji:
          emojiOf(version.payload.emoji, version.payload.groupId) ?? undefined,
      })),
  ];
  const place = places.find(({ value }) => value === placeId) ?? null;

  const getWhere = (): HorizonWhere | null => {
    if (!holdsMoney) return { kind: 'keep' };
    if (pick === 'free') return { kind: 'free' };
    if (pick === 'keep') return { kind: 'keep' };
    return pick === 'place' && place
      ? { kind: 'place', toId: place.value, name: place.name }
      : null;
  };
  const where = getWhere();
  const getBlocker = () => {
    if (where !== null) return null;
    return pick === 'place'
      ? HORIZON_END_WORDS.needsPlace
      : HORIZON_END_WORDS.needsChoice;
  };
  const blocker = getBlocker();

  const changeJson =
    isCallOff && where !== null
      ? JSON.stringify({
          kind: 'version',
          version: {
            itemId,
            kind: 'horizon',
            effectiveFrom: today,
            effectiveUntil: null,
            changeId: 'what-if',
            payload: setHorizonState(horizon, 'calledOff', today, null),
          },
          move:
            holdsMoney && where.kind !== 'keep'
              ? {
                  fromId: itemId,
                  toId: where.kind === 'place' ? where.toId : null,
                  cents: leftCents,
                }
              : undefined,
        } satisfies PreviewChange)
      : null;

  const getLive = () =>
    selectAllHorizonItems(store.getState(), todayAsUtcDate()).find(
      ({ item }) => item.id === itemId,
    )?.version.payload ?? null;

  const undo = async (written: HorizonStateWritten) => {
    const live = getLive();
    if (!user || live === null || live.state !== written.after.state) {
      addToast({
        title: HORIZON_END_WORDS.changedSince,
        type: 'error',
      });
      return;
    }
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoHorizonState(
        user.uid,
        encryption,
        written,
        HORIZON_END_WORDS.undoEndSummary(
          horizon.name,
          written.after.state === 'finished' ? 'finished' : 'calledOff',
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
    if (isSavingRef.current || !user || where === null) return;
    if (!navigator.onLine) {
      setError(HORIZON_END_WORDS.offline);
      return;
    }
    const live = getLive();
    if (live === null || live.state !== 'open') {
      setError(HORIZON_END_WORDS.alreadyDone);
      return;
    }
    const why = reason.trim() === '' ? null : reason.trim();
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const run = isCallOff ? callOffHorizon : finishHorizon;
      const written = await run(user.uid, encryption, {
        itemId,
        horizon: live,
        today,
        leftCents: leftNow(),
        where,
        note: why,
      });
      if (written === null) {
        setError(HORIZON_END_WORDS.alreadyDone);
        return;
      }
      addToast({
        title: mask(
          isCallOff
            ? HORIZON_END_WORDS.calledOff(live.name)
            : HORIZON_END_WORDS.finished(live.name),
        ),
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

  const leftNow = () =>
    Math.max(0, selectBalances(store.getState()).assignedByItem[itemId] ?? 0);

  const title = isCallOff
    ? HORIZON_END_WORDS.callOffTitle(horizon.name)
    : HORIZON_END_WORDS.finishTitle(horizon.name);
  const primary = isCallOff
    ? HORIZON_END_WORDS.callOffConfirm
    : HORIZON_END_WORDS.finishLabel(horizon.name);

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink label={horizon.name} onBack={onBack} />
      <div className='space-y-1'>
        <ActionTitle>{title}</ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {isCallOff
            ? HORIZON_END_WORDS.callOffNote
            : HORIZON_END_WORDS.finishNote}
        </p>
      </div>
      {isCallOff && (
        <ActionSection caption={HORIZON_END_WORDS.whatStops}>
          {stops.length === 0 && bills.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_END_WORDS.noOpenCosts}
            </p>
          ) : (
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {stops.map((cost) => (
                <li key={cost.id} className='px-3 py-2 text-sm break-words'>
                  <MaskedText>
                    {HORIZON_END_WORDS.stopsRow(
                      cost.name,
                      describeCostWhen(cost.schedule, cost.ending),
                      cost.schedule.kind === 'once'
                        ? describeCost(cost).figure
                        : null,
                    )}
                  </MaskedText>
                </li>
              ))}
              {bills.map((cost) => (
                <li
                  key={cost.id}
                  className='text-muted-foreground px-3 py-2 text-sm break-words'
                >
                  {HORIZON_END_WORDS.staysBill(cost.name)}
                </li>
              ))}
            </ul>
          )}
        </ActionSection>
      )}
      {changeJson !== null && (
        <EffectPreview
          changeJson={changeJson}
          emptyText={HORIZON_END_WORDS.effectNone}
          isCompact
        />
      )}
      {holdsMoney && (
        <ActionSection
          caption={mask(
            HORIZON_END_WORDS.moneyQuestion(formatCents(leftCents)),
          )}
        >
          <HeldChoiceList
            value={pick === 'free' || pick === 'keep' ? pick : null}
            onChange={(choice) => {
              setPick(choice);
              setError(null);
            }}
            freeBody={HORIZON_END_WORDS.freeBody}
            keepBody={HELD_WORDS.keepBody}
          />
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<ArrowRightLeft />}
              label={HORIZON_END_WORDS.placeRow}
              subtitle={
                pick === 'place' && place
                  ? HORIZON_END_WORDS.placePicked(place.name)
                  : HORIZON_END_WORDS.placeRowSub
              }
              onClick={() => setPick('place')}
            />
          </ActionGroup>
          {pick === 'place' &&
            (places.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {HORIZON_END_WORDS.placeNone}
              </p>
            ) : (
              <PillGroup
                label={HORIZON_END_WORDS.placeCaption}
                options={places}
                value={placeId}
                onChange={setPlaceId}
              />
            ))}
        </ActionSection>
      )}
      {isCallOff && isReasonOpen && (
        <>
          <SuggestionChips
            label={CHANGE_WORDS.whyHeading}
            suggestions={CHANGE_REASON_CHIPS.horizon}
            isDisabled={isSaving}
            onPick={setReason}
          />
          <NoteTextField
            label='Note'
            value={reason}
            onChange={setReason}
            placeholder={CHANGE_WORDS.whyPlaceholder}
            maxLength={MAX_NOTE_LENGTH}
            rows={1}
          />
        </>
      )}
      {isCallOff && (
        <div>
          <RevealChip
            onClick={() => {
              if (isReasonOpen) setReason('');
              setIsReasonOpen(!isReasonOpen);
            }}
          >
            {isReasonOpen
              ? LIFECYCLE_WORDS.removeReason
              : LIFECYCLE_WORDS.addReason}
          </RevealChip>
        </div>
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
            {primary}
          </Button>
        }
      />
    </div>
  );
}

export default HorizonEndView;
