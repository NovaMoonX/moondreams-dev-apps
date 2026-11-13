import { useState } from 'react';
import { CalendarClock, CalendarPlus } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  HORIZON_PLAN_WORDS,
  MOVE_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { getGoalLinkBlock } from '@apps/runway/engine/horizonGoal';
import { useEnvelopeIntoHorizonToast } from '@apps/runway/hooks/useEnvelopeIntoHorizon';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import type { HorizonSeed } from '@apps/runway/forms/HorizonForm';
import {
  linkGoalToHorizon,
  putEnvelopeIntoHorizon,
} from '@apps/runway/store/actions/horizonGoalActions';
import { newTransferMoveId } from '@apps/runway/store/actions/transferActions';
import {
  selectOpenHorizonItems,
  type ResolvedHorizon,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

export type HorizonPlanSource =
  | {
      kind: 'goal';
      goalId: string;
      name: string;
      emoji: string | null;
      targetCents: number;
      targetDate: number | null;
    }
  | {
      kind: 'envelope';
      envelopeId: string;
      name: string;
      emoji: string | null;
      heldCents: number;
    };

interface HorizonPlanViewProps {
  source: HorizonPlanSource;
  today: number;
  onBack: () => void;
  /** The person chose a new event: the caller opens the form with this start. */
  onNewEvent: (seed: HorizonSeed) => void;
  /** The envelope is closed, so the sheet that opened this has nothing left to show. */
  onClose: () => void;
}

/** Which event a goal or an envelope is planned on: a new one first, then the open events. A goal is linked to the one picked; an envelope asks first, then closes and moves its money in. */
function HorizonPlanView({
  source,
  today,
  onBack,
  onNewEvent,
  onClose,
}: HorizonPlanViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const showMoved = useEnvelopeIntoHorizonToast();
  const events = useAppSelector((state) =>
    selectOpenHorizonItems(state, today),
  );
  const [query, setQuery] = useState('');
  const [moveId] = useState(newTransferMoveId);
  const [picked, setPicked] = useState<ResolvedHorizon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasSearch = events.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = events.filter(({ version }) =>
    version.payload.name.toLowerCase().includes(needle),
  );

  const linkGoal = async (event: ResolvedHorizon) => {
    if (!user || source.kind !== 'goal') return;
    const block = getGoalLinkBlock(
      source.goalId,
      event.item.id,
      events.map(({ item, version }) => ({
        id: item.id,
        horizon: version.payload,
      })),
    );
    if (block !== null) {
      setError(
        block === 'goalTaken'
          ? HORIZON_PLAN_WORDS.goalTaken(
              source.name,
              events.find(
                ({ version }) => version.payload.goalId === source.goalId,
              )?.version.payload.name ?? '',
            )
          : HORIZON_PLAN_WORDS.eventHasGoal(
              event.version.payload.name,
              source.name,
            ),
      );
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await linkGoalToHorizon(user.uid, encryption, {
        eventId: event.item.id,
        baseVersionId: event.version.id,
        horizon: event.version.payload,
        goalId: source.goalId,
        goal: { name: source.name, targetCents: source.targetCents },
        today,
      });
      if (written === null) {
        setError(HORIZON_PLAN_WORDS.failed);
        return;
      }
      addToast({
        title: HORIZON_PLAN_WORDS.linked(
          source.name,
          event.version.payload.name,
        ),
        type: 'success',
      });
      onBack();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? HORIZON_PLAN_WORDS.offline
          : getErrorMessage(saveError, HORIZON_PLAN_WORDS.failed),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const moveEnvelope = async () => {
    if (!user || source.kind !== 'envelope' || picked === null) return;
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await putEnvelopeIntoHorizon(user.uid, encryption, {
        moveId,
        envelopeId: source.envelopeId,
        envelopeName: source.name,
        eventId: picked.item.id,
        eventName: picked.version.payload.name,
        cents: source.heldCents,
        leftCents: source.heldCents,
      });
      showMoved(written, {
        envelope: source.name,
        event: picked.version.payload.name,
      });
      onClose();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? HORIZON_PLAN_WORDS.offline
          : getErrorMessage(saveError, HORIZON_PLAN_WORDS.failed),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const newSeed: HorizonSeed =
    source.kind === 'goal'
      ? {
          kind: 'goal',
          goalId: source.goalId,
          name: source.name,
          emoji: source.emoji,
          targetDate: source.targetDate,
          targetCents: source.targetCents,
        }
      : {
          kind: 'envelope',
          envelopeId: source.envelopeId,
          name: source.name,
          emoji: source.emoji,
          heldCents: source.heldCents,
        };

  if (picked !== null && source.kind === 'envelope') {
    return (
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <BackLink onBack={() => setPicked(null)} />
        <ActionTitle>
          {mask(
            HORIZON_PLAN_WORDS.envelopeConfirm(
              source.name,
              formatCents(source.heldCents),
              picked.version.payload.name,
            ),
          )}
        </ActionTitle>
        <ModalFooterActions
          note={error}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={() => setPicked(null)}
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
              disabled={isSaving}
              onClick={() => void moveEnvelope()}
            >
              {HORIZON_PLAN_WORDS.envelopeAction(source.name)}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_PLAN_WORDS.title}</ActionTitle>
      <ActionGroup>
        <ActionRow
          isGrouped
          hasChevron
          icon={<CalendarPlus />}
          label={HORIZON_PLAN_WORDS.newEvent}
          subtitle={
            source.kind === 'goal'
              ? HORIZON_PLAN_WORDS.newEventSubGoal(source.name)
              : HORIZON_PLAN_WORDS.newEventSubEnvelope(source.name)
          }
          onClick={() => onNewEvent(newSeed)}
        />
      </ActionGroup>
      {hasSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={HORIZON_PLAN_WORDS.search}
        />
      )}
      {events.length > 0 &&
        (visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {HORIZON_PLAN_WORDS.noMatch}
          </p>
        ) : (
          <ActionGroup>
            {visible.map((event) => (
              <ActionRow
                key={event.item.id}
                isGrouped
                hasChevron
                icon={<CalendarClock />}
                label={event.version.payload.name}
                subtitle={formatDateOrdinalUTC(event.version.payload.happensOn)}
                isDisabled={isSaving}
                onClick={() => {
                  if (source.kind === 'goal') void linkGoal(event);
                  else {
                    setError(null);
                    setPicked(event);
                  }
                }}
              />
            ))}
          </ActionGroup>
        ))}
      {error !== null && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </div>
  );
}

export default HorizonPlanView;
