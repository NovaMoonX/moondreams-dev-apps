import { useState } from 'react';

import { CalendarClock, CalendarPlus, Link2Off, XCircle } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import ItemMark from '@apps/runway/components/ItemMark';
import {
  COMING_WORDS,
  HORIZON_END_WORDS,
  PART_OF_WORDS,
} from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { findLinkHolder } from '@apps/runway/engine/horizonLinks';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import {
  canCancelComingChange,
  useCancelChange,
} from '@apps/runway/hooks/useCancelChange';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  setChangeLink,
  type LinkEventEdit,
} from '@apps/runway/store/actions/horizonLinkActions';
import {
  selectAllCards,
  selectAllHorizonItems,
  selectOpenHorizonItems,
  selectStance,
  type ResolvedHorizon,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeCancelTitle,
  describeChangeFigures,
  describeChangeLine,
  getChangeRef,
  listItemChanges,
} from '@apps/runway/utils/comingChangeText';
import { getChangeFigure } from '@apps/runway/utils/planChangeText';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';

interface ChangeSheetViewProps {
  change: PlanChange;
  today: number;
  onBack: () => void;
  /** Opened from the event's own sheet: the event is where the person already is, so it is not offered as a door, and the sheet closes once the change moves off it. */
  isFromEvent?: boolean;
}

const toEdit = (event: ResolvedHorizon, summary: string): LinkEventEdit => ({
  eventId: event.item.id,
  horizon: event.version.payload,
  baseVersionId: event.version.id,
  summary,
});

/** One coming change on its own: what changes, when, until when and which event it is part of, with the ways to tie it to an event, untie it or cancel it. */
const KNOWN_FAILURES: readonly string[] = [
  PART_OF_WORDS.alreadyStarted,
  PART_OF_WORDS.eventChanged,
  PART_OF_WORDS.eventGone,
  HORIZON_END_WORDS.changedJustNow,
  COMING_WORDS.gone,
];

function ChangeSheetView({
  change,
  today,
  onBack,
  isFromEvent = false,
}: ChangeSheetViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const cancel = useCancelChange();
  const allCards = useAppSelector(selectAllCards);
  const events = useAppSelector((state) => selectAllHorizonItems(state, today));
  const openEvents = useAppSelector((state) =>
    selectOpenHorizonItems(state, today),
  );
  const stance = useAppSelector(selectStance);
  const versions = useAppSelector((state) => state.runway.versions);
  const header = useAppSelector(
    (state) =>
      state.runway.items.find(({ id }) => id === change.itemId) ?? null,
  );
  const [isPicking, setIsPicking] = useState(false);
  const [isEventOpen, setIsEventOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardNamer = getCardNamer(allCards);
  const ref = getChangeRef(change);
  const link = { changeId: ref.changeId, itemId: change.itemId };
  const holder = findLinkHolder(events, link);
  const holderName = holder?.version.payload.name ?? null;
  const name = change.after.payload.name;
  const isOpenHolder = holder?.version.payload.state === 'open';
  const figures = describeChangeFigures(change, cardNamer);
  const lines =
    change.what === 'change' && !change.isReturn && figures
      ? figures.split('; ')
      : [];
  const lastDay = formatDateOrdinalUTC(change.on - DAY_MS);
  const back = change.isReturn ? getChangeFigure(change.after) : null;
  const canCancel = canCancelComingChange(change);
  const choices =
    holder === null || isOpenHolder
      ? openEvents.filter(({ item }) => item.id !== holder?.item.id)
      : [];

  const run = async (task: () => Promise<void>, fallback: string) => {
    if (isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      await task();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setError(KNOWN_FAILURES.includes(message) ? message : fallback);
    } finally {
      setIsBusy(false);
    }
  };

  const writeLink = (
    to: ResolvedHorizon | null,
    from: ResolvedHorizon | null,
  ) =>
    run(async () => {
      if (!user) return;
      if (change.on <= todayAsUtcDate()) throw new Error(COMING_WORDS.gone);
      const latest = selectAllHorizonItems(store.getState(), today);
      const fresh = (event: ResolvedHorizon | null) =>
        event === null
          ? null
          : (latest.find(({ item }) => item.id === event.item.id) ?? null);
      const target = fresh(to);
      const source = fresh(from);
      if (
        (to !== null && target?.version.payload.state !== 'open') ||
        (from !== null && source?.version.payload.state !== 'open')
      )
        throw new Error(PART_OF_WORDS.eventGone);
      await setChangeLink(user.uid, await getRunwayEncryption(user.uid), {
        link,
        today,
        from: source
          ? toEdit(
              source,
              PART_OF_WORDS.unlinkedLine(name, source.version.payload.name),
            )
          : null,
        to: target
          ? toEdit(
              target,
              PART_OF_WORDS.linkedLine(
                name,
                figures ??
                  (change.what === 'stop'
                    ? PART_OF_WORDS.ends
                    : PART_OF_WORDS.starts),
                formatDateOrdinalUTC(change.on),
                target.version.payload.name,
              ),
            )
          : null,
      });
      addToast({
        title: target
          ? COMING_WORDS.tieOn(target.version.payload.name)
          : COMING_WORDS.untied(source?.version.payload.name ?? ''),
        type: 'success',
      });
      setIsPicking(false);
      if (isFromEvent) onBack();
    }, COMING_WORDS.tieFailed);

  const askCancel = async () => {
    const isConfirmed = await confirm({
      title: mask(describeCancelTitle(change, cardNamer)),
      message: COMING_WORDS.cancelBody,
      confirmText: COMING_WORDS.cancelConfirm,
      cancelText: COMING_WORDS.cancelKeep,
      destructive: true,
    });
    if (!isConfirmed) return;
    await run(async () => {
      const done = await cancel(change);
      if (!done) {
        setError(COMING_WORDS.gone);
        return;
      }
      addToast({ title: COMING_WORDS.cancelled(name), type: 'success' });
      onBack();
    }, COMING_WORDS.cancelFailed);
  };

  if (isPicking) {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={() => setIsPicking(false)} />
        <ActionTitle>{COMING_WORDS.tieTitle}</ActionTitle>
        {choices.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {COMING_WORDS.tieNone}
          </p>
        ) : (
          <ActionGroup>
            {choices.map((event) => (
              <ActionRow
                key={event.item.id}
                isGrouped
                icon={
                  <ItemMark
                    itemId={event.item.id}
                    name={event.version.payload.name}
                  />
                }
                label={event.version.payload.name}
                isDisabled={isBusy}
                onClick={() =>
                  void writeLink(event, isOpenHolder ? holder : null)
                }
              />
            ))}
          </ActionGroup>
        )}
        {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      </div>
    );
  }

  const getWhen = () => {
    if (change.what === 'stop') return COMING_WORDS.stopsAfter(lastDay);
    if (change.isReturn)
      return back
        ? PART_OF_WORDS.comingBackTo(back.text, lastDay)
        : COMING_WORDS.backAfter(lastDay);
    if (change.what === 'start')
      return COMING_WORDS.startsOn(formatDateOrdinalUTC(change.on));
    return COMING_WORDS.from(formatDateOrdinalUTC(change.on));
  };
  const getUntil = () => {
    const ends = versions.flatMap((version) =>
      version.itemId === change.itemId &&
      version.changeId === ref.changeId &&
      version.effectiveUntil !== null
        ? [version.effectiveUntil]
        : [],
    );
    if (change.what !== 'change' || change.isReturn || ends.length === 0)
      return null;
    const end = Math.max(...ends);
    const goesBack = listItemChanges(
      versions,
      header,
      change.itemId,
      today,
      () => false,
    ).some((coming) => coming.isReturn && coming.on === end);
    const lastEnd = formatDateOrdinalUTC(end - DAY_MS);
    return goesBack
      ? COMING_WORDS.until(lastEnd)
      : COMING_WORDS.untilOnly(lastEnd);
  };
  const untilLine = getUntil();

  const eventRows = (
    <>
      {holder && (
        <ActionRow
          isGrouped
          hasChevron={!isFromEvent}
          icon={<CalendarClock />}
          label={holderName ?? ''}
          subtitle={
            isOpenHolder && !isFromEvent
              ? COMING_WORDS.openEventSub
              : isOpenHolder
                ? undefined
                : PART_OF_WORDS.none
          }
          onClick={() => !isFromEvent && setIsEventOpen(true)}
        />
      )}
      {choices.length > 0 && (
        <ActionRow
          isGrouped
          hasChevron
          icon={<CalendarPlus />}
          label={isOpenHolder ? COMING_WORDS.changeEvent : COMING_WORDS.tie}
          subtitle={isOpenHolder ? undefined : COMING_WORDS.tieSub}
          isDisabled={isBusy}
          onClick={() => setIsPicking(true)}
        />
      )}
      {isOpenHolder && holderName && (
        <ActionRow
          isGrouped
          icon={<Link2Off />}
          label={COMING_WORDS.untie(holderName)}
          subtitle={COMING_WORDS.untieSub}
          isDisabled={isBusy}
          onClick={() => void writeLink(null, holder)}
        />
      )}
    </>
  );

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{mask(describeChangeLine(change, cardNamer))}</ActionTitle>
      <dl className='space-y-3 text-[15px]'>
        {lines.length > 0 && (
          <div>
            <dt className='text-muted-foreground text-xs'>
              {COMING_WORDS.whatChanges}
            </dt>
            {lines.map((line, index) => (
              <dd key={`${index}${line}`}>{mask(line)}</dd>
            ))}
          </div>
        )}
        <div>
          <dt className='text-muted-foreground text-xs'>
            {COMING_WORDS.whenCaption}
          </dt>
          <dd>{mask(getWhen())}</dd>
          {untilLine && <dd>{mask(untilLine)}</dd>}
        </div>
      </dl>
      {(holder || choices.length > 0) && (
        <ActionSection caption={COMING_WORDS.partOfCaption}>
          <ActionGroup>{eventRows}</ActionGroup>
        </ActionSection>
      )}
      {canCancel && (
        <ActionGroup>
          <ActionRow
            isGrouped
            isDestructive
            icon={<XCircle />}
            label={COMING_WORDS.cancel}
            subtitle={COMING_WORDS.cancelSub}
            isDisabled={isBusy}
            onClick={() => void askCancel()}
          />
        </ActionGroup>
      )}
      {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      {isEventOpen && holder && !isFromEvent && (
        <HorizonSheet
          itemId={holder.item.id}
          horizon={holder.version.payload}
          today={today}
          stance={stance}
          onClose={() => setIsEventOpen(false)}
        />
      )}
    </div>
  );
}

export default ChangeSheetView;
