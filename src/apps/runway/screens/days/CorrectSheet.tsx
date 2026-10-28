import { useEffect, useId, useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import { ActionSection } from '@apps/runway/components/ActionSection';
import BackLink from '@/components/BackLink';
import BeforeAfterRow from '@/components/BeforeAfterRow';
import InlineNotice from '@/components/InlineNotice';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import {
  LineAmountList,
  LineAmountView,
} from '@apps/runway/components/LineAmounts';
import {
  BlockerDoor,
  CoverCard,
  CutsSection,
} from '@apps/runway/components/ShortfallJourney';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  CONFIRM_COVER_WORDS,
  CONFIRM_FLOW_WORDS,
  CONFIRM_WORDS,
  CORRECT_COVER_WORDS,
  CORRECT_WORDS,
  DRAFT_WORDS,
  MAX_NOTE_LENGTH,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  buildCorrection,
  getCorrectionGap,
  getDayCover,
  getFreeForCorrection,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import {
  getCoverable,
  getRemainder,
  suggestShortfall,
} from '@apps/runway/engine/differences';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  correctDay,
  DayChangedElsewhere,
} from '@apps/runway/store/actions/dayActions';
import {
  selectHeldByItem,
  selectOpenDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, CorrectionChange } from '@apps/runway/types';

interface CorrectSheetProps {
  dayKey: string;
  base: EffectiveSplit;
  onClose: () => void;
}

type Blocker = { text: string; door: 'cover' | 'cuts' | null };

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Corrects a confirmed day in two steps: the amounts, then what the change does to the envelopes, goals and bills before it is written. A correction that leaves the day short beyond its cover offers the same cover and cuts as Confirm; nothing moves without a tap. Needs a connection. */
function CorrectSheet({ dayKey, base, onClose }: CorrectSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isMounted = useRef(true);
  const coverId = useId();
  const cutsId = useId();
  const { isHidden } = useValuesHidden();
  const balances = useAppSelector(selectBalances);
  const items = useAppSelector((state) => state.runway.items);
  const held = useAppSelector(selectHeldByItem);
  const openDay = useAppSelector((state) => selectOpenDay(state, dayKey));
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [amount, setAmount] = useState(centsToInputValue(base.arrivedCents));
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const editingLine =
    base.lines.find((line) => line.lineId === editingLineId) ?? null;
  const [coverChoice, setCoverChoice] = useState<Cents>(0);
  const [undoInputs, setUndoInputs] = useState<Record<string, string> | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [isNoting, setIsNoting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const arrivedCents = parseMoneyToCents(amount);
  const parsed = Object.entries(lineInputs).map(
    ([lineId, text]) => [lineId, parseMoneyToCents(text)] as const,
  );
  const hasBadLine = parsed.some(([, cents]) => cents === null);
  const edits = Object.fromEntries(
    parsed.flatMap(([lineId, cents]) =>
      cents === null ? [] : [[lineId, cents] as const],
    ),
  ) as Record<string, Cents>;
  const kindOf = (itemId: string) =>
    items.find((item) => item.id === itemId)?.kind ?? null;
  const corrected =
    arrivedCents === null
      ? null
      : buildCorrection({
          base,
          arrivedCents,
          edits,
          note: null,
        });
  const remainder =
    arrivedCents === null || corrected === null
      ? 0
      : getRemainder(arrivedCents, corrected.lines);
  const changes = corrected?.changes ?? [];
  const isChanged =
    corrected !== null &&
    (changes.length > 0 || corrected.arrivedCents !== base.arrivedCents);

  const hasAmount = arrivedCents !== null && arrivedCents > 0;
  const heldCover = getDayCover(base);
  const gap = hasAmount ? getCorrectionGap(base, remainder) : 0;
  const figure = getFreeToSpendFigure(balances);
  const freeCents = figure.kind === 'amount' ? figure.cents : null;
  const coverFree = getFreeForCorrection(freeCents, base);
  const coverable = getCoverable(gap, coverFree);
  const isCoverGone = coverChoice > (coverFree ?? 0);
  const cover = isCoverGone ? 0 : Math.min(coverChoice, gap);
  const rest = gap - cover;
  const isOfferingCover = rest > 0 && coverable > cover;
  const correctedLines = corrected?.lines ?? base.lines;
  const billLineIds = new Set(
    base.lines
      .filter((line) => kindOf(line.itemId) === 'bill')
      .map((line) => line.lineId),
  );
  const suggestion =
    rest > 0 ? suggestShortfall(correctedLines, rest, billLineIds) : {};
  const suggested = Object.entries(suggestion).map(([lineId, cents]) => {
    const line = correctedLines.find((entry) => entry.lineId === lineId);
    return {
      lineId,
      name:
        line === undefined || line.name === ''
          ? DRAFT_WORDS.billFallback
          : line.name,
      emoji: line?.emoji ?? null,
      fromCents: line?.cents ?? 0,
      toCents: cents,
    };
  });
  const loweredCount = correctedLines.filter((line) => {
    const was = base.lines.find((entry) => entry.lineId === line.lineId);
    return was !== undefined && line.cents < was.cents;
  }).length;

  const getBlocker = (): Blocker | null => {
    if (!hasAmount) return { text: CONFIRM_WORDS.needsAmount, door: null };
    if (hasBadLine) return { text: CONFIRM_WORDS.needsLineAmount, door: null };
    if (isOfferingCover)
      return { text: CONFIRM_COVER_WORDS.needsCover, door: 'cover' };
    if (rest > 0) return { text: CORRECT_COVER_WORDS.needsCuts, door: 'cuts' };
    if (!isChanged) return { text: CORRECT_WORDS.nothingChanged, door: null };
    return null;
  };
  const blocker = getBlocker();

  const applyCuts = () => {
    setUndoInputs(lineInputs);
    setLineInputs((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(suggestion).map(([lineId, cents]) => [
          lineId,
          centsToInputValue(cents),
        ]),
      ),
    }));
  };

  const undoCuts = () => {
    setLineInputs(undoInputs ?? {});
    setUndoInputs(null);
  };

  const changeAmount = (text: string) => {
    setAmount(text);
    setCoverChoice(0);
    setUndoInputs(null);
  };

  const goToFix = (door: Blocker['door']) => {
    const target = document.getElementById(door === 'cover' ? coverId : cutsId);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  };

  const getFooterNote = (isDoor: boolean) => {
    if (blocker === null) return null;
    if (blocker.door === null) return blocker.text;
    return (
      <BlockerDoor
        text={blocker.text}
        isDoor={isDoor}
        onOpen={() => goToFix(blocker.door)}
      />
    );
  };

  const searchText = search.trim().toLowerCase();
  const visibleLines = base.lines.filter(
    (line) =>
      searchText === '' ||
      Object.hasOwn(edits, line.lineId) ||
      (line.name === '' ? DRAFT_WORDS.billFallback : line.name)
        .toLowerCase()
        .includes(searchText),
  );

  const getEffectText = (change: CorrectionChange) => {
    const delta = change.afterCents - change.beforeCents;
    const kind = kindOf(change.itemId);
    if (kind === 'goal') {
      const now = held[change.itemId] ?? 0;
      return `Saved so far ${formatCents(now)} to ${formatCents(now + delta)}.`;
    }
    if (kind === 'bill') {
      return delta > 0
        ? `${formatCents(delta)} more set aside for this bill.`
        : `${formatCents(-delta)} less set aside for this bill.`;
    }
    return null;
  };

  const requestClose = useDiscardGuard({
    isDirty:
      amount !== centsToInputValue(base.arrivedCents) ||
      Object.keys(lineInputs).length > 0 ||
      note.trim() !== '' ||
      coverChoice > 0,
    onClose,
    isBusy: isSaving,
  });

  const ticked = new Set(openDay?.doneLineIds ?? []);
  const hasUntick = changes.some((change) => ticked.has(change.lineId));

  const handleSave = async () => {
    if (!user || blocker !== null || arrivedCents === null) return;
    const currentFree = getFreeToSpendFigure(selectBalances(store.getState()));
    const nowForCover = getFreeForCorrection(
      currentFree.kind === 'amount' ? currentFree.cents : null,
      base,
    );
    if (cover > 0 && cover > (nowForCover ?? 0)) {
      setCoverChoice(0);
      setError(CORRECT_COVER_WORDS.coverGone);
      setStep('edit');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await correctDay(user.uid, encryption, {
        dayId: dayKey,
        base,
        arrivedCents,
        edits,
        note: note.trim() === '' ? null : note.trim(),
        addedCoverCents: cover,
      });
      onClose();
    } catch (saveError) {
      const message = isOfflineFailure(saveError)
        ? CORRECT_WORDS.offline
        : getErrorMessage(
            saveError,
            'This did not correct. Nothing was changed.',
          );
      if (isMounted.current) {
        setError(message);
        setIsSaving(false);
      }
      if (saveError instanceof DayChangedElsewhere || !isMounted.current) {
        addToast({
          title: 'This day did not change',
          description: message,
          type: 'error',
        });
      }
    }
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={CORRECT_WORDS.sheetTitle}
      actions={<ValuesEyeButton />}
    >
      {step === 'edit' && editingLine ? (
        <LineAmountView
          name={
            editingLine.name === ''
              ? DRAFT_WORDS.billFallback
              : editingLine.name
          }
          value={
            Object.hasOwn(lineInputs, editingLine.lineId)
              ? lineInputs[editingLine.lineId]
              : centsToInputValue(editingLine.cents)
          }
          onChange={(text) =>
            setLineInputs((current) => ({
              ...current,
              [editingLine.lineId]: text,
            }))
          }
          onBack={() => setEditingLineId(null)}
          plannedCents={editingLine.cents}
          footerNote={blocker?.text ?? null}
        />
      ) : step === 'edit' ? (
        <div className='space-y-4'>
          {gap === 0 && (
            <InlineNotice tone='info'>{CORRECT_WORDS.intro}</InlineNotice>
          )}
          <AmountHero
            label={CONFIRM_WORDS.amount}
            value={amount}
            onChange={changeAmount}
            suffix={
              <p className='font-medium'>
                {DRAFT_WORDS.dayLeft}{' '}
                <SensitiveValue>{formatCents(remainder)}</SensitiveValue>
                {arrivedCents !== null && (
                  <span className='text-muted-foreground font-normal'>
                    {' '}
                    of{' '}
                    <SensitiveValue>{formatCents(arrivedCents)}</SensitiveValue>
                  </span>
                )}
              </p>
            }
          />
          {gap > 0 && (
            <InlineNotice
              tone='warning'
              title={
                <MaskedText>
                  {CORRECT_COVER_WORDS.shortTitle(formatCents(gap))}
                </MaskedText>
              }
            >
              {heldCover > 0 ? (
                <MaskedText>
                  {CORRECT_COVER_WORDS.shortBeyondCover(formatCents(heldCover))}
                </MaskedText>
              ) : (
                CORRECT_COVER_WORDS.shortBody
              )}
            </InlineNotice>
          )}
          {gap > 0 && (
            <ActionSection caption={CONFIRM_FLOW_WORDS.coverCaption}>
              <div className='border-border rounded-2xl border p-3'>
                <CoverCard
                  id={coverId}
                  gapCents={gap}
                  coverableCents={coverable}
                  coverCents={cover}
                  freeCents={coverFree ?? 0}
                  freeAfterCents={(coverFree ?? 0) - cover}
                  freeLead={
                    base.freeToSpendCents > 0
                      ? CORRECT_COVER_WORDS.freeLead
                      : undefined
                  }
                  isHidden={isHidden}
                  isDisabled={isSaving}
                  onCover={() => setCoverChoice(coverable)}
                  onUndo={() => setCoverChoice(0)}
                />
              </div>
            </ActionSection>
          )}
          {(undoInputs !== null || suggested.length > 0) && (
            <ActionSection caption={CONFIRM_FLOW_WORDS.suggestCaption}>
              <CutsSection
                id={cutsId}
                suggested={suggested}
                usedCount={undoInputs === null ? null : loweredCount}
                isCovered={cover > 0}
                isOfferingCover={isOfferingCover}
                isDisabled={isSaving}
                onApply={applyCuts}
                onUndo={undoCuts}
              />
            </ActionSection>
          )}
          {base.lines.length >= RUNWAY_SEARCH_THRESHOLD && (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={CONFIRM_FLOW_WORDS.findItem}
            />
          )}
          {visibleLines.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {CONFIRM_FLOW_WORDS.noItemMatch}
            </p>
          )}
          <LineAmountList
            className='max-h-[max(12rem,calc(92dvh-30rem))]'
            onOpen={setEditingLineId}
            items={visibleLines.map((line) => ({
              id: line.lineId,
              name: line.name === '' ? DRAFT_WORDS.billFallback : line.name,
              emoji: line.emoji,
              cents:
                corrected?.lines.find((l) => l.lineId === line.lineId)?.cents ??
                line.cents,
              detail:
                Object.hasOwn(edits, line.lineId) &&
                edits[line.lineId] !== line.cents
                  ? `${CONFIRM_WORDS.planned} ${formatCents(line.cents)}`
                  : null,
            }))}
          />
          <ModalFooterActions
            note={error ?? getFooterNote(true)}
            cancelAction={
              <Button type='button' variant='secondary' onClick={requestClose}>
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                disabled={blocker !== null}
                onClick={() => setStep('review')}
              >
                {CORRECT_WORDS.review}
              </Button>
            }
          />
        </div>
      ) : (
        <div className='space-y-4'>
          <BackLink onBack={() => setStep('edit')} />
          {corrected && (
            <ActionSection caption={CORRECT_WORDS.reviewTitle}>
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {corrected.arrivedCents !== base.arrivedCents && (
                  <BeforeAfterRow
                    isPrivate
                    title='Money that arrived'
                    before={formatCents(base.arrivedCents)}
                    after={formatCents(corrected.arrivedCents)}
                    beforeLabel={CORRECT_WORDS.confirmed}
                    afterLabel={CORRECT_WORDS.corrected}
                  />
                )}
                {cover > 0 && (
                  <BeforeAfterRow
                    isPrivate
                    title={CORRECT_COVER_WORDS.freeRow}
                    before={formatCents(freeCents ?? 0)}
                    after={formatCents(
                      (freeCents ?? 0) +
                        corrected.freeToSpendCents -
                        base.freeToSpendCents,
                    )}
                    beforeLabel={CORRECT_COVER_WORDS.now}
                    afterLabel={CORRECT_WORDS.corrected}
                  />
                )}
                <BeforeAfterRow
                  isPrivate
                  title={DRAFT_WORDS.dayLeft}
                  before={formatCents(base.freeToSpendCents)}
                  after={formatCents(corrected.freeToSpendCents)}
                  beforeLabel={CORRECT_WORDS.confirmed}
                  afterLabel={CORRECT_WORDS.corrected}
                />
                {changes.map((change) => {
                  const effect = getEffectText(change);
                  return (
                    <BeforeAfterRow
                      isPrivate
                      key={change.lineId}
                      title={
                        change.name === ''
                          ? DRAFT_WORDS.billFallback
                          : change.name
                      }
                      leading={
                        <ItemBadge name={change.name} emoji={change.emoji} />
                      }
                      before={formatCents(change.beforeCents)}
                      after={formatCents(change.afterCents)}
                      beforeLabel={CORRECT_WORDS.confirmed}
                      afterLabel={CORRECT_WORDS.corrected}
                      detail={
                        effect ? (
                          <p className='text-muted-foreground text-sm'>
                            <MaskedText>{effect}</MaskedText>
                          </p>
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>
            </ActionSection>
          )}
          {hasUntick && (
            <InlineNotice tone='info'>
              {CORRECT_WORDS.untickedNote}
            </InlineNotice>
          )}
          {!isNoting && note === '' ? (
            <div>
              <RevealChip onClick={() => setIsNoting(true)}>
                {CORRECT_WORDS.note}
              </RevealChip>
            </div>
          ) : (
            <ActionSection caption='Note'>
              <Input
                variant='outline'
                aria-label='Note on the correction'
                autoFocus={isNoting}
                maxLength={MAX_NOTE_LENGTH}
                placeholder={CORRECT_WORDS.notePlaceholder}
                value={note}
                disabled={isSaving}
                onChange={(event) => setNote(event.target.value)}
              />
            </ActionSection>
          )}
          <ModalFooterActions
            note={error}
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={requestClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                loading={isSaving}
                disabled={isSaving || blocker !== null}
                onClick={() => void handleSave()}
              >
                {CORRECT_WORDS.save}
              </Button>
            }
          />
        </div>
      )}
    </FormSheet>
  );
}

export default CorrectSheet;
