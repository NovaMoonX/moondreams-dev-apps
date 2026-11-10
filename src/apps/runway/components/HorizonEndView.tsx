import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import RevealChip from '@/components/RevealChip';
import SuggestionChips from '@/components/SuggestionChips';
import SummaryRow from '@/components/SummaryRow';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import EffectPreview from '@apps/runway/components/EffectPreview';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CHANGE_REASON_CHIPS,
  CHANGE_WORDS,
  HELD_WORDS,
  HORIZON_END_WORDS,
  LIFECYCLE_WORDS,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  listCostPayments,
  listMadeBills,
  listOpenCosts,
  setHorizonState,
} from '@apps/runway/engine/horizon';
import { getCancelInput } from '@apps/runway/hooks/useCancelChange';
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
import {
  selectBalances,
  selectHeldBy,
} from '@apps/runway/store/selectors/balanceSelectors';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import {
  selectAllCards,
  selectAllHorizonItems,
  selectCostPaid,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonLink, HorizonSealed, Stance } from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeChangeLine,
  listCallOffChanges,
} from '@apps/runway/utils/comingChangeText';
import { describeCostWhen, describeCost } from '@apps/runway/utils/horizonText';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

const MAX_STOPS_SHOWN = 3;

type Choice = 'free' | 'keep' | 'place' | null;
type ChangesChoice = 'cancel' | 'keep' | null;
type Step = 'changes' | 'money' | 'details' | 'review';

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
  const versions = useAppSelector((state) => state.runway.versions);
  const items = useAppSelector((state) => state.runway.items);
  const allCards = useAppSelector(selectAllCards);
  const [pick, setPick] = useState<Choice>(null);
  const [changesPick, setChangesPick] = useState<ChangesChoice>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickBeforePicker, setPickBeforePicker] = useState<Choice>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Step | null>(null);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const reasonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const isCallOff = mode === 'callOff';
  const leftCents = Math.max(0, balances.assignedByItem[itemId] ?? 0);
  const holdsMoney = leftCents > 0;
  const getDueOn = (cost: Parameters<typeof listCostPayments>[0]) =>
    listCostPayments(cost, today + 400 * DAY_MS, stance, paid).find(
      (payment) => payment.paid === null,
    )?.dueOn ?? Number.MAX_SAFE_INTEGER;
  const stops = isCallOff
    ? listOpenCosts(horizon, today, stance, paid)
        .map((cost) => ({ cost, dueOn: getDueOn(cost) }))
        .sort((a, b) => a.dueOn - b.dueOn)
        .map(({ cost }) => cost)
    : [];
  const bills = isCallOff ? listMadeBills(horizon) : [];
  const changeRows = isCallOff
    ? listCallOffChanges(horizon.links, versions, items, today)
    : [];
  const cardNamer = getCardNamer(allCards);
  const rows = [
    ...stops.map((cost) => ({ cost, isBill: false })),
    ...bills.map((cost) => ({ cost, isBill: true })),
  ];

  const toPlace = (
    {
      item,
      version,
    }: {
      item: { id: string };
      version: {
        payload: { name: string; emoji: string | null; groupId: string | null };
      };
    },
    group: 'envelope' | 'goal',
  ) => ({
    value: item.id,
    name: version.payload.name,
    group,
    emoji: emojiOf(version.payload.emoji, version.payload.groupId) ?? undefined,
  });
  const places = [
    ...envelopes.map((entry) => toPlace(entry, 'envelope')),
    ...goals
      .filter(({ version }) => version.payload.state !== 'paused')
      .map((entry) => toPlace(entry, 'goal')),
  ];
  const needle = query.trim().toLowerCase();
  const shown = places.filter(({ name }) =>
    name.toLowerCase().includes(needle),
  );
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
    if (changeRows.length > 0 && changesPick === null)
      return HORIZON_END_WORDS.needsChangesChoice;
    if (where === null) {
      return pick === 'place'
        ? HORIZON_END_WORDS.needsPlace
        : HORIZON_END_WORDS.needsChoice;
    }
    return null;
  };
  const blocker = getBlocker();

  const getFreeLine = (to: HorizonWhere) => {
    const money = formatCents(leftCents);
    if (to.kind === 'free') return HORIZON_END_WORDS.freeUp(money);
    return `${HORIZON_END_WORDS.freeSame} ${
      to.kind === 'place'
        ? HORIZON_END_WORDS.placeGets(to.name, money)
        : HORIZON_END_WORDS.heldStays(money, horizon.name)
    }`;
  };
  const changeJson =
    where !== null
      ? JSON.stringify({
          kind: 'version',
          version: {
            itemId,
            kind: 'horizon',
            effectiveFrom: today,
            effectiveUntil: null,
            changeId: 'what-if',
            payload: setHorizonState(
              horizon,
              isCallOff ? 'calledOff' : 'finished',
              today,
              null,
            ),
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
    )?.version ?? null;

  const undo = async (written: HorizonStateWritten) => {
    const live = getLive();
    if (!user || live === null || live.id !== written.versionId) {
      addToast({
        title: HORIZON_END_WORDS.changedSince,
        type: 'error',
      });
      return;
    }
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const toId = written.move?.toId ?? null;
      const isUndone = await undoHorizonState(
        user.uid,
        encryption,
        written,
        HORIZON_END_WORDS.undoEndSummary(
          horizon.name,
          written.after.state === 'finished' ? 'finished' : 'calledOff',
        ),
        todayAsUtcDate(),
        {
          cents: selectHeldBy(store.getState(), toId),
          name:
            toId === null
              ? HORIZON_END_WORDS.freeTitle
              : (place?.name ?? HORIZON_END_WORDS.anotherPlace),
        },
      );
      addToast(
        isUndone
          ? {
              title: mask(HORIZON_END_WORDS.openAgain(horizon.name)),
              type: 'success',
            }
          : { title: HORIZON_END_WORDS.changedSince, type: 'error' },
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
    const found = getLive();
    const live = found?.payload ?? null;
    if (found === null || live === null || live.state !== 'open') {
      setError(HORIZON_END_WORDS.alreadyDone);
      return;
    }
    if (leftNow() !== leftCents) {
      setError(HORIZON_END_WORDS.moneyChanged);
      return;
    }
    const fresh = isCallOff
      ? listCallOffChanges(
          live.links,
          store.getState().runway.versions,
          store.getState().runway.items,
          todayAsUtcDate(),
        )
      : [];
    const keyOf = (link: HorizonLink) => `${link.itemId}-${link.changeId}`;
    const asked = new Set(changeRows.map(({ link }) => keyOf(link)));
    if (
      isCallOff &&
      (fresh.length !== asked.size ||
        fresh.some(({ link }) => !asked.has(keyOf(link))))
    ) {
      setError(HORIZON_END_WORDS.changedJustNow);
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
        baseVersionId: found.id,
        today,
        leftCents,
        where,
        note: why,
        unlinks: fresh.map(({ link }) => link),
        cancels:
          changesPick === 'cancel'
            ? fresh.map(({ target, change }) =>
                getCancelInput(change, target, todayAsUtcDate(), false),
              )
            : [],
      });
      if (written === null) {
        setError(HORIZON_END_WORDS.alreadyDone);
        return;
      }
      const money = formatCents(leftCents);
      addToast({
        title: mask(
          isCallOff
            ? HORIZON_END_WORDS.calledOff(live.name)
            : HORIZON_END_WORDS.finished(live.name),
        ),
        description:
          [
            holdsMoney
              ? mask(
                  where.kind === 'free'
                    ? HORIZON_END_WORDS.movedFree(money)
                    : where.kind === 'place'
                      ? HORIZON_END_WORDS.movedPlace(money, where.name)
                      : HORIZON_END_WORDS.movedHeld(money),
                )
              : null,
            changesPick === 'cancel' && fresh.length > 0
              ? HORIZON_END_WORDS.changesStayCancelled
              : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
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

  const closePicker = () => {
    setIsPickerOpen(false);
    setQuery('');
    setPick(pickBeforePicker);
  };
  useEffect(() => {
    if (!isPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      closePicker();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // closePicker only reads `pickBeforePicker`, which the deps below cover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPickerOpen, pickBeforePicker]);

  const leftNow = () =>
    Math.max(0, selectBalances(store.getState()).assignedByItem[itemId] ?? 0);

  const title = isCallOff
    ? HORIZON_END_WORDS.callOffTitle(horizon.name)
    : HORIZON_END_WORDS.finishTitle(horizon.name);
  const primary = isCallOff
    ? HORIZON_END_WORDS.callOffConfirm
    : HORIZON_END_WORDS.finishConfirm;

  if (isPickerOpen) {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={closePicker} />
        <ActionTitle>{HORIZON_END_WORDS.placeCaption}</ActionTitle>
        {places.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {HORIZON_END_WORDS.placeNone}
          </p>
        ) : (
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={HORIZON_END_WORDS.placeSearch}
            />
            {shown.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {HORIZON_END_WORDS.placeNoMatch}
              </p>
            )}
            {(
              [
                ['envelope', HORIZON_END_WORDS.envelopesHeading],
                ['goal', HORIZON_END_WORDS.goalsHeading],
              ] as const
            ).map(([group, heading]) => {
              const options = shown.filter((entry) => entry.group === group);
              return options.length === 0 ? null : (
                <div key={group} className='space-y-2'>
                  <SectionDivider label={heading} />
                  <ActionGroup>
                    {options.map((option) => (
                      <ActionRow
                        key={option.value}
                        isGrouped
                        icon={
                          option.value === placeId ? (
                            <Check />
                          ) : (
                            (option.emoji ?? <ArrowRightLeft />)
                          )
                        }
                        label={option.name}
                        onClick={() => {
                          setPlaceId(option.value);
                          setEditing(null);
                          setIsPickerOpen(false);
                          setQuery('');
                        }}
                      />
                    ))}
                  </ActionGroup>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  const firstOpen = (): Step | null => {
    if (changeRows.length > 0 && changesPick === null) return 'changes';
    return holdsMoney && where === null ? 'money' : null;
  };
  const step: Step = editing ?? firstOpen() ?? 'review';
  const goBack = () => {
    if (step === 'review') return onBack();
    if (step === 'details' || (editing !== null && firstOpen() === null))
      return setEditing(null);
    if (step === 'money' && changeRows.length > 0) return setEditing('changes');
    return onBack();
  };

  const footer = (
    <ModalFooterActions
      note={step === 'review' ? error : null}
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
        step === 'review' ? (
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void save()}
          >
            {primary}
          </Button>
        ) : null
      }
    />
  );

  if (step === 'changes') {
    return (
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <BackLink onBack={goBack} />
        <ActionTitle>
          {HORIZON_END_WORDS.changesQuestion(changeRows.length)}
        </ActionTitle>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {changeRows.map(({ link, change }) => (
            <li
              key={`${link.itemId}-${link.changeId}`}
              className='px-3 py-2 text-sm break-words'
            >
              <MaskedText>{describeChangeLine(change, cardNamer)}</MaskedText>
            </li>
          ))}
        </ul>
        <ChoiceCards
          options={[
            {
              value: 'cancel' as const,
              title: HORIZON_END_WORDS.changesCancelTitle(changeRows.length),
              body: HORIZON_END_WORDS.changesCancelBody(changeRows.length),
            },
            {
              value: 'keep' as const,
              title: HORIZON_END_WORDS.changesKeepTitle(
                horizon.name,
                changeRows.length,
              ),
              body: HORIZON_END_WORDS.changesKeepBody(changeRows.length),
            },
          ]}
          value={changesPick}
          onChange={(choice) => {
            setChangesPick(choice);
            setEditing(null);
            setError(null);
          }}
        />
        {footer}
      </div>
    );
  }

  if (step === 'money') {
    return (
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <BackLink onBack={goBack} />
        <ActionTitle>
          <MaskedText>
            {HORIZON_END_WORDS.moneyQuestion(formatCents(leftCents))}
          </MaskedText>
        </ActionTitle>
        <ChoiceCards
          options={[
            {
              value: 'free' as const,
              title: HORIZON_END_WORDS.freeTitle,
              body: HORIZON_END_WORDS.freeBody,
            },
            {
              value: 'keep' as const,
              title: HELD_WORDS.keepTitle,
              body: HELD_WORDS.keepBody,
            },
            {
              value: 'place' as const,
              title: HORIZON_END_WORDS.placeRow,
              hasChevron: true,
              body:
                pick === 'place' && place
                  ? HORIZON_END_WORDS.placePicked(place.name)
                  : HORIZON_END_WORDS.placeRowSub,
            },
          ]}
          value={pick}
          onChange={(choice) => {
            if (choice === 'place') setPickBeforePicker(pick);
            setPick(choice);
            setIsPickerOpen(choice === 'place');
            if (choice !== 'place') setEditing(null);
            setError(null);
          }}
        />
        {footer}
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <BackLink onBack={goBack} />
        <ActionTitle>{HORIZON_END_WORDS.detailsTitle}</ActionTitle>
        {isCallOff && rows.length > 0 && (
          <ActionSection caption={HORIZON_END_WORDS.whatStops}>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {rows.slice(0, MAX_STOPS_SHOWN).map(({ cost, isBill }) =>
                isBill ? (
                  <li
                    key={cost.id}
                    className='text-muted-foreground px-3 py-2 text-sm break-words'
                  >
                    {HORIZON_END_WORDS.staysBill(cost.name)}
                  </li>
                ) : (
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
                ),
              )}
              {rows.length > MAX_STOPS_SHOWN && (
                <li className='text-muted-foreground px-3 py-2 text-sm'>
                  {HORIZON_END_WORDS.andMore(rows.length - MAX_STOPS_SHOWN)}
                </li>
              )}
            </ul>
          </ActionSection>
        )}
        {changeJson !== null && (
          <EffectPreview
            changeJson={changeJson}
            emptyText=''
            caption={HORIZON_END_WORDS.detailsMoves}
            isCompact
            lead={
              holdsMoney && where !== null ? (
                <p className='text-sm'>
                  <MaskedText>{getFreeLine(where)}</MaskedText>
                </p>
              ) : null
            }
          />
        )}
        {footer}
      </div>
    );
  }

  const getMoneyAnswer = (to: HorizonWhere) => {
    if (to.kind === 'free') return HORIZON_END_WORDS.moneyToFree;
    return to.kind === 'place'
      ? HORIZON_END_WORDS.moneyToPlace(to.name)
      : HORIZON_END_WORDS.moneyStaysHeld(horizon.name);
  };
  const stopCount = rows.filter(({ isBill }) => !isBill).length;
  const billCount = rows.length - stopCount;

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={goBack} />
      <ActionTitle>{title}</ActionTitle>
      <div className='space-y-2'>
        {changeRows.length > 0 && changesPick !== null && (
          <SummaryRow
            label={HORIZON_END_WORDS.changesRowLabel(changeRows.length)}
            onClick={() => setEditing('changes')}
          >
            {HORIZON_END_WORDS.changesAnswer(changesPick, changeRows.length)}
          </SummaryRow>
        )}
        {holdsMoney && where !== null && (
          <SummaryRow
            label={
              <MaskedText>
                {HORIZON_END_WORDS.moneyRowLabel(formatCents(leftCents))}
              </MaskedText>
            }
            onClick={() => setEditing('money')}
          >
            {getMoneyAnswer(where)}
          </SummaryRow>
        )}
        {changeJson !== null && (
          <SummaryRow
            label={HORIZON_END_WORDS.detailsTitle}
            onClick={() => setEditing('details')}
          >
            {isCallOff && rows.length > 0
              ? HORIZON_END_WORDS.detailsStops(stopCount, billCount)
              : HORIZON_END_WORDS.detailsDays}
          </SummaryRow>
        )}
      </div>
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
        <div ref={reasonRef} className='scroll-mb-24'>
          <RevealChip
            onClick={() => {
              if (isReasonOpen) setReason('');
              setIsReasonOpen(!isReasonOpen);
              if (!isReasonOpen)
                requestAnimationFrame(() =>
                  reasonRef.current?.scrollIntoView({ block: 'nearest' }),
                );
            }}
          >
            {isReasonOpen
              ? LIFECYCLE_WORDS.removeReason
              : LIFECYCLE_WORDS.addReason}
          </RevealChip>
        </div>
      )}
      {footer}
    </div>
  );
}

export default HorizonEndView;
