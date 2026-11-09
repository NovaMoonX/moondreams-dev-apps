import { useState } from 'react';

import { CalendarClock, CalendarPlus, Link2Off, XCircle } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import ItemMark from '@apps/runway/components/ItemMark';
import { COMING_WORDS, PART_OF_WORDS } from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
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
  describeComingHeadline,
  getChangeRef,
} from '@apps/runway/utils/comingChangeText';
import { getChangeFigure } from '@apps/runway/utils/planChangeText';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';

interface ChangeSheetViewProps {
  change: PlanChange;
  today: number;
  onBack: () => void;
}

const toEdit = (event: ResolvedHorizon, summary: string): LinkEventEdit => ({
  eventId: event.item.id,
  horizon: event.version.payload,
  baseVersionId: event.version.id,
  summary,
});

/** One coming change on its own: what changes, when, until when and which event it is part of, with the ways to tie it to an event, untie it or cancel it. */
function ChangeSheetView({ change, today, onBack }: ChangeSheetViewProps) {
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
  const choices = openEvents.filter(({ item }) => item.id !== holder?.item.id);

  const run = async (task: () => Promise<void>) => {
    if (isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      await task();
    } catch (failure) {
      setError(getErrorMessage(failure, COMING_WORDS.tieFailed));
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
    });

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
    });
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
    return COMING_WORDS.from(formatDateOrdinalUTC(change.on));
  };
  const getUntil = () => {
    const ends = store
      .getState()
      .runway.versions.flatMap((version) =>
        version.itemId === change.itemId &&
        version.changeId === ref.changeId &&
        version.effectiveUntil !== null
          ? [version.effectiveUntil]
          : [],
      );
    return change.what === 'change' && !change.isReturn && ends.length > 0
      ? COMING_WORDS.until(formatDateOrdinalUTC(Math.max(...ends) - DAY_MS))
      : null;
  };
  const untilLine = getUntil();

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>
        {mask(describeComingHeadline(change, cardNamer))}
      </ActionTitle>
      {lines.length > 0 && (
        <ActionSection caption={COMING_WORDS.whatChanges}>
          <ul className='border-border bg-card divide-border divide-y rounded-2xl border text-[15px]'>
            {lines.map((line) => (
              <li key={line} className='px-3 py-2.5'>
                {mask(line)}
              </li>
            ))}
          </ul>
        </ActionSection>
      )}
      <ActionSection caption={COMING_WORDS.whenCaption}>
        <div className='border-border bg-card rounded-2xl border px-3 py-2.5 text-[15px]'>
          <p>{mask(getWhen())}</p>
          {untilLine && (
            <p className='text-muted-foreground'>{mask(untilLine)}</p>
          )}
        </div>
      </ActionSection>
      {holder && (
        <ActionSection caption={COMING_WORDS.partOfCaption}>
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<CalendarClock />}
              label={holderName ?? ''}
              subtitle={
                isOpenHolder ? COMING_WORDS.openEventSub : PART_OF_WORDS.none
              }
              onClick={() => setIsEventOpen(true)}
            />
          </ActionGroup>
        </ActionSection>
      )}
      <ActionGroup>
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
        {canCancel && (
          <ActionRow
            isGrouped
            isDestructive
            icon={<XCircle />}
            label={COMING_WORDS.cancel}
            subtitle={COMING_WORDS.cancelSub}
            isDisabled={isBusy}
            onClick={() => void askCancel()}
          />
        )}
      </ActionGroup>
      {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      {isEventOpen && holder && (
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
