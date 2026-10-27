import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, TriangleAlert, Undo2 } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import FoldedDateField from '@/components/FoldedDateField';
import InlineNotice from '@/components/InlineNotice';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import SensitiveValue from '@/components/SensitiveValue';
import SummaryRow from '@/components/SummaryRow';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { store, useAppSelector } from '@/store';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { LineAmountEditList } from '@apps/runway/components/LineAmounts';
import {
  CONFIRM_COVER_WORDS,
  CONFIRM_FLOW_WORDS,
  CONFIRM_WORDS,
  DRAFT_WORDS,
  FORM_FLOW_WORDS,
  MAX_NOTE_LENGTH,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import {
  countUnresolvedHolds,
  getProtectedLineIds,
  toRecordLines,
} from '@apps/runway/engine/confirm';
import {
  applyLineEdits,
  getCoverable,
  getRemainder,
  suggestShortfall,
} from '@apps/runway/engine/differences';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  confirmDay,
  DayChangedElsewhere,
} from '@apps/runway/store/actions/dayActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectComingDays,
  type DraftView,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, Stance } from '@apps/runway/types';

interface ConfirmFormData {
  amount: string;
  arrivedOn: string;
  note: string;
}

interface ConfirmSheetProps {
  view: DraftView;
  stance: Stance;
  onClose: () => void;
}

type Blocker = { text: string; door: 'cover' | 'cuts' | null };

const SUGGESTIONS_SHOWN = 3;

const toInputs = (
  edits: Record<string, Cents>,
  lines: { lineId: string }[],
): Record<string, string> =>
  Object.fromEntries(
    lines.flatMap((line) =>
      Object.hasOwn(edits, line.lineId)
        ? [[line.lineId, centsToInputValue(edits[line.lineId])] as const]
        : [],
    ),
  );

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Asks the amount that arrived and the day it did, and confirms the day. When less arrives it offers to cover the difference from Free to spend and proposes what gets less; nothing moves without a tap. Needs a connection: the day and its two records are written together. */
function ConfirmSheet({ view, stance, onClose }: ConfirmSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const isMounted = useRef(true);
  const coverId = useId();
  const cutsId = useId();
  const { day, draft } = view;
  const today = todayAsUtcDate();
  const balances = useAppSelector(selectBalances);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const initialData: ConfirmFormData = {
    amount: centsToInputValue(draft.moneyCents),
    arrivedOn: toDateInputValue(today),
    note: '',
  };
  const [formData, setFormData] = useState<ConfirmFormData>(initialData);
  const [isNoting, setIsNoting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [lineSearch, setLineSearch] = useState('');
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [coverChoice, setCoverChoice] = useState<Cents>(0);
  const [undoInputs, setUndoInputs] = useState<Record<string, string> | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const arrivedCents = parseMoneyToCents(formData.amount);
  const hasAmount = arrivedCents !== null && arrivedCents > 0;
  const arrivedOn = fromDateInputValue(formData.arrivedOn) ?? null;
  const difference =
    arrivedCents === null ? 0 : arrivedCents - draft.moneyCents;
  const lines = toRecordLines(draft, view.items);
  const parsedInputs = Object.entries(lineInputs).map(
    ([lineId, text]) => [lineId, parseMoneyToCents(text)] as const,
  );
  const hasBadLine = parsedInputs.some(([, cents]) => cents === null);
  const edits = Object.fromEntries(
    parsedInputs.flatMap(([lineId, cents]) =>
      cents === null ? [] : [[lineId, cents] as const],
    ),
  ) as Record<string, Cents>;
  const adjusted = applyLineEdits(lines, edits, draft.days[0]?.dayKey ?? '');
  const changedCount = adjusted.filter(
    (line, index) => line.cents !== lines[index].cents,
  ).length;
  const loweredCount = adjusted.filter(
    (line, index) => line.cents < lines[index].cents,
  ).length;
  const searchText = lineSearch.trim().toLowerCase();
  const visibleLines = adjusted
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line, index }) =>
        searchText === '' ||
        line.cents !== lines[index].cents ||
        (lines[index].name === '' ? 'bill' : lines[index].name)
          .toLowerCase()
          .includes(searchText),
    );
  const remainder = hasAmount ? getRemainder(arrivedCents, adjusted) : 0;
  const gap = Math.max(0, -remainder);
  const figure = getFreeToSpendFigure(balances);
  const freeCents = figure.kind === 'amount' ? figure.cents : null;
  const coverable = getCoverable(gap, freeCents);
  const isCoverGone = coverChoice > (freeCents ?? 0);
  const cover = isCoverGone ? 0 : Math.min(coverChoice, gap);
  const rest = gap - cover;
  const isOfferingCover = rest > 0 && coverable > 0 && cover === 0;
  const isNoticeShown = hasAmount && difference < 0;
  const nextDayOn = comingDays.find((coming) => coming.on > day.on)?.on ?? null;
  const suggestion = rest > 0
    ? suggestShortfall(adjusted, rest, getProtectedLineIds(draft, nextDayOn))
    : {};
  const suggested = Object.entries(suggestion).map(([lineId, cents]) => {
    const index = adjusted.findIndex((line) => line.lineId === lineId);
    return { line: lines[index], from: adjusted[index].cents, to: cents };
  });

  const getBlocker = (): Blocker | null => {
    if (countUnresolvedHolds(draft) > 0)
      return { text: CONFIRM_WORDS.holds, door: null };
    if (!hasAmount) return { text: CONFIRM_WORDS.needsAmount, door: null };
    if (arrivedOn === null || arrivedOn > today)
      return { text: CONFIRM_WORDS.needsDate, door: null };
    if (hasBadLine) return { text: CONFIRM_WORDS.needsLineAmount, door: null };
    if (isOfferingCover)
      return {
        text: isNoticeShown
          ? CONFIRM_COVER_WORDS.needsCover
          : CONFIRM_FLOW_WORDS.needsCover(formatCents(gap)),
        door: 'cover',
      };
    if (rest > 0)
      return {
        text: isNoticeShown
          ? CONFIRM_COVER_WORDS.needsCuts
          : CONFIRM_FLOW_WORDS.needsCuts(
              cover > 0 ? mask(formatCents(rest)) : formatCents(rest),
            ),
        door: 'cuts',
      };
    return null;
  };
  const blocker = getBlocker();

  const applyCuts = () => {
    setUndoInputs(lineInputs);
    setLineInputs((current) => ({
      ...current,
      ...toInputs(suggestion, lines),
    }));
  };

  const undoCuts = () => {
    setLineInputs(undoInputs ?? {});
    setUndoInputs(null);
  };

  const openLines = () => {
    if (
      Object.keys(lineInputs).length === 0 &&
      suggested.length > 0 &&
      !isOfferingCover
    )
      applyCuts();
    setIsChoosing(true);
  };

  const setLineInput = (lineId: string, text: string) =>
    setLineInputs((current) => ({ ...current, [lineId]: text }));

  const handleConfirm = async () => {
    if (
      !user ||
      blocker !== null ||
      arrivedCents === null ||
      arrivedOn === null
    )
      return;
    const currentFree = getFreeToSpendFigure(selectBalances(store.getState()));
    if (
      cover > 0 &&
      cover > (currentFree.kind === 'amount' ? currentFree.cents : 0)
    ) {
      setCoverChoice(0);
      setError(CONFIRM_COVER_WORDS.coverGone);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await confirmDay(user.uid, encryption, {
        day: {
          payLineId: day.payLineId,
          sourceId: day.sourceId,
          expectedOn: day.on,
        },
        draft,
        names: view.items,
        stance,
        fingerprint: view.fingerprint,
        overrideFingerprint: view.overrideFingerprint,
        arrivedOn,
        arrivedCents,
        note: formData.note.trim() === '' ? null : formData.note.trim(),
        edits,
        lineNotes: Object.fromEntries(
          Object.entries(lineNotes).map(([lineId, text]) => [
            lineId,
            text.trim() === '' ? null : text.trim(),
          ]),
        ),
        coverCents: cover,
      });
      onClose();
    } catch (confirmError) {
      const message = isOfflineFailure(confirmError)
        ? CONFIRM_WORDS.offline
        : getErrorMessage(
            confirmError,
            'This did not confirm. Nothing was changed.',
          );
      if (isMounted.current) {
        setError(message);
        setIsSaving(false);
      }
      if (confirmError instanceof DayChangedElsewhere || !isMounted.current) {
        addToast({
          title: 'This day did not confirm',
          description: message,
          type: 'error',
        });
      }
    }
  };

  const requestClose = useDiscardGuard({
    isDirty:
      JSON.stringify(formData) !== JSON.stringify(initialData) ||
      Object.keys(lineInputs).length > 0 ||
      Object.keys(lineNotes).length > 0 ||
      coverChoice > 0,
    onClose,
    isBusy: isSaving,
  });

  const setField = (patch: Partial<ConfirmFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const setAmount = (amount: string) => {
    setField({ amount });
    setCoverChoice(0);
    setUndoInputs(null);
  };

  const goToFix = (door: Blocker['door']) => {
    const target = document.getElementById(door === 'cover' ? coverId : cutsId);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  };

  const getFooterNote = () => {
    if (error) return error;
    if (blocker === null) return null;
    if (blocker.door === null) return blocker.text;
    const icon = (
      <TriangleAlert
        key='icon'
        className='text-warning mt-0.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
    );
    const words = (
      <span key='words' className='text-foreground min-w-0 flex-1'>
        {blocker.text}
      </span>
    );
    if (isChoosing) {
      return (
        <span className='flex items-start gap-2'>
          {icon}
          {words}
        </span>
      );
    }
    return (
      <Button
        type='button'
        variant='tertiary'
        className='h-auto min-h-10 w-full items-start justify-between gap-2 px-0! text-left text-xs font-normal whitespace-normal'
        onClick={() => goToFix(blocker.door)}
      >
        {icon}
        {words}
        <ChevronRight
          className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    );
  };
  const footerNote = getFooterNote();

  const getLessBody = () => {
    if (gap === 0) return CONFIRM_FLOW_WORDS.lessFromLeft;
    if (gap === Math.abs(difference) && changedCount === 0)
      return CONFIRM_FLOW_WORDS.lessNothingLeft;
    return CONFIRM_FLOW_WORDS.lessGap(formatCents(gap));
  };

  const getNotice = () => {
    if (!hasAmount || difference === 0) return null;
    const amount = formatCents(Math.abs(difference));
    if (difference > 0) {
      return (
        <InlineNotice
          tone='success'
          title={CONFIRM_FLOW_WORDS.moreTitle(amount)}
        >
          {CONFIRM_FLOW_WORDS.moreBody}
        </InlineNotice>
      );
    }
    return (
      <InlineNotice tone='warning' title={CONFIRM_FLOW_WORDS.lessTitle(amount)}>
        {getLessBody()}
      </InlineNotice>
    );
  };

  const getCoverBody = () => {
    if (cover > 0) {
      return (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='min-w-0 flex-1 text-sm' role='status'>
            {CONFIRM_COVER_WORDS.coveredLead}{' '}
            <SensitiveValue>{formatCents(cover)}</SensitiveValue>{' '}
            {CONFIRM_COVER_WORDS.coveredTail}{' '}
            {CONFIRM_FLOW_WORDS.coveredAfter}{' '}
            <SensitiveValue>
              {formatCents((freeCents ?? 0) - cover)}
            </SensitiveValue>
            .
          </p>
          <RevealChip
            icon={<Undo2 className='h-4 w-4' aria-hidden='true' />}
            onClick={() => setCoverChoice(0)}
          >
            {CONFIRM_FLOW_WORDS.undo}
          </RevealChip>
        </div>
      );
    }
    if (coverable === 0) {
      return (
        <p className='text-sm'>
          {CONFIRM_FLOW_WORDS.coverNone(formatCents(gap))}
        </p>
      );
    }
    return (
      <div className='space-y-3'>
        {isHidden ? (
          <p className='text-sm'>{CONFIRM_COVER_WORDS.coverHidden}</p>
        ) : (
          <p className='text-sm'>
            {CONFIRM_FLOW_WORDS.coverLead}{' '}
            <SensitiveValue>{formatCents(freeCents ?? 0)}</SensitiveValue>
            {coverable === gap
              ? CONFIRM_COVER_WORDS.coverAll
              : CONFIRM_COVER_WORDS.coverPart}
          </p>
        )}
        <Button
          id={coverId}
          type='button'
          variant='secondary'
          className='w-full'
          disabled={isSaving}
          onClick={() => setCoverChoice(coverable)}
        >
          {isHidden
            ? CONFIRM_COVER_WORDS.coverHiddenAction
            : coverable === gap
              ? CONFIRM_FLOW_WORDS.coverAction
              : CONFIRM_FLOW_WORDS.coverPartAction}
        </Button>
      </div>
    );
  };

  const cutsStatus =
    undoInputs !== null ? (
      <div className='border-border flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3'>
        <p className='min-w-0 flex-1 text-sm' role='status'>
          {CONFIRM_FLOW_WORDS.used(loweredCount)}
        </p>
        <RevealChip
          icon={<Undo2 className='h-4 w-4' aria-hidden='true' />}
          onClick={undoCuts}
        >
          {CONFIRM_FLOW_WORDS.undo}
        </RevealChip>
      </div>
    ) : null;

  const cutsOffer =
    suggested.length > 0 ? (
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {cover > 0
            ? CONFIRM_COVER_WORDS.suggestRest
            : isOfferingCover
              ? CONFIRM_COVER_WORDS.suggestInstead
              : CONFIRM_FLOW_WORDS.suggestIntro}
        </p>
        <ul className='border-border divide-border divide-y rounded-2xl border'>
          {suggested.slice(0, SUGGESTIONS_SHOWN).map(({ line, from, to }) => {
            const name = line.name === '' ? 'Bill' : line.name;
            return (
              <li key={line.lineId} className='flex items-start gap-3 p-3'>
                <ItemBadge name={name} emoji={line.emoji} />
                <span className='min-w-0 flex-1'>
                  <span className='block text-base font-medium break-words'>
                    <span className='line-clamp-2'>{name}</span>
                  </span>
                  <span className='text-muted-foreground block text-sm'>
                    {CONFIRM_FLOW_WORDS.suggestDetail(formatCents(from))}
                  </span>
                </span>
                <span className='text-base font-semibold whitespace-nowrap tabular-nums'>
                  {cover > 0 ? (
                    <SensitiveValue>{formatCents(to)}</SensitiveValue>
                  ) : (
                    formatCents(to)
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {suggested.length > SUGGESTIONS_SHOWN && (
          <p className='text-muted-foreground text-sm'>
            {CONFIRM_FLOW_WORDS.suggestMore(
              suggested.length - SUGGESTIONS_SHOWN,
            )}
          </p>
        )}
        <Button
          id={cutsId}
          type='button'
          variant='secondary'
          className='w-full'
          disabled={isSaving}
          onClick={applyCuts}
        >
          {CONFIRM_FLOW_WORDS.useThese}
        </Button>
      </div>
    ) : null;

  const cutsSection =
    cutsStatus !== null || cutsOffer !== null ? (
      <div className='space-y-3'>
        {cutsStatus}
        {cutsOffer}
      </div>
    ) : null;

  const formBody = (
    <div className='space-y-5'>
      <div className='space-y-3'>
        <AmountHero
          label={CONFIRM_WORDS.amount}
          value={formData.amount}
          onChange={setAmount}
          disabled={isSaving}
        />
        {getNotice()}
      </div>
      {hasAmount && gap > 0 && (
        <ActionSection caption={CONFIRM_FLOW_WORDS.coverCaption}>
          <div className='border-border rounded-2xl border p-3'>
            {getCoverBody()}
          </div>
        </ActionSection>
      )}
      {hasAmount && cutsSection && (
        <ActionSection caption={CONFIRM_FLOW_WORDS.suggestCaption}>
          {cutsSection}
        </ActionSection>
      )}
      {hasAmount && (
        <SummaryRow
          label={CONFIRM_FLOW_WORDS.eachItem}
          ariaLabel={`${CONFIRM_FLOW_WORDS.eachItem}, ${changedCount > 0 ? FORM_FLOW_WORDS.linesChanged(changedCount) : FORM_FLOW_WORDS.linesAsPlanned}, change`}
          onClick={openLines}
        >
          {changedCount > 0
            ? FORM_FLOW_WORDS.linesChanged(changedCount)
            : FORM_FLOW_WORDS.linesAsPlanned}
        </SummaryRow>
      )}
      <FoldedDateField
        label={FORM_FLOW_WORDS.arrivedOn}
        value={formData.arrivedOn}
        onChange={(arrivedOn) => setField({ arrivedOn })}
        todayValue={toDateInputValue(today)}
        max={toDateInputValue(today)}
        disabled={isSaving}
      />
      {difference !== 0 &&
        (!isNoting && formData.note === '' ? (
          <div>
            <RevealChip onClick={() => setIsNoting(true)}>
              {CONFIRM_WORDS.note}
            </RevealChip>
          </div>
        ) : (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>Note</p>
            <Input
              variant='outline'
              aria-label='Note on the difference'
              autoFocus={isNoting}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={CONFIRM_WORDS.notePlaceholder}
              value={formData.note}
              disabled={isSaving}
              onChange={(event) => setField({ note: event.target.value })}
            />
          </div>
        ))}
      <ModalFooterActions
        note={footerNote}
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
            onClick={() => void handleConfirm()}
          >
            {CONFIRM_WORDS.confirm}
          </Button>
        }
      />
    </div>
  );

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={CONFIRM_WORDS.sheetTitle}
      actions={<ValuesEyeButton />}
    >
      {isChoosing && (
        <div className='space-y-3'>
          <div className='space-y-3'>
            <BackLink onBack={() => setIsChoosing(false)} />
            <div className='space-y-1'>
              <InlineNotice tone='info'>
                {CONFIRM_WORDS.adjustIntro}
              </InlineNotice>
              <div
                className='flex flex-wrap items-baseline justify-between gap-x-3 pt-1'
                role='status'
              >
                <p className='text-muted-foreground text-sm whitespace-nowrap'>
                  {DRAFT_WORDS.dayLeft}
                </p>
                <p className='text-right whitespace-nowrap'>
                  <span
                    className={join(
                      'text-xl font-semibold tabular-nums',
                      remainder + cover < 0 && 'text-(--runway-warning-ink)',
                    )}
                  >
                    {cover > 0 ? (
                      <SensitiveValue>
                        {formatCents(remainder + cover)}
                      </SensitiveValue>
                    ) : (
                      formatCents(remainder + cover)
                    )}
                  </span>
                  {arrivedCents !== null && (
                    <span className='text-muted-foreground text-sm'>
                      {' '}
                      of {formatCents(arrivedCents)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              {suggested.length > 0 && (
                <RevealChip onClick={applyCuts}>
                  {CONFIRM_WORDS.lowestFirst}
                </RevealChip>
              )}
              {Object.keys(lineInputs).length > 0 && (
                <RevealChip
                  onClick={() => {
                    setLineInputs({});
                    setLineNotes({});
                    setUndoInputs(null);
                  }}
                >
                  {CONFIRM_WORDS.resetLines}
                </RevealChip>
              )}
            </div>
            {adjusted.length >= RUNWAY_SEARCH_THRESHOLD && (
              <SearchInput
                value={lineSearch}
                onChange={setLineSearch}
                placeholder={CONFIRM_FLOW_WORDS.findItem}
              />
            )}
            {visibleLines.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {CONFIRM_FLOW_WORDS.noItemMatch}
              </p>
            )}
          </div>
          <LineAmountEditList
            className='max-h-[max(9rem,calc(92dvh-29rem))] [@media(max-height:499px)]:max-h-none'
            notePlaceholder={CONFIRM_WORDS.lineNotePlaceholder}
            isDisabled={isSaving}
            onChange={setLineInput}
            onNote={(lineId, text) =>
              setLineNotes((current) => ({ ...current, [lineId]: text }))
            }
            items={visibleLines.map(({ line, index }) => {
              const original = lines[index];
              return {
                id: line.lineId,
                name: original.name === '' ? 'Bill' : original.name,
                emoji: original.emoji,
                value: Object.hasOwn(lineInputs, line.lineId)
                  ? lineInputs[line.lineId]
                  : centsToInputValue(original.cents),
                plannedCents: original.cents,
                isChanged: line.cents !== original.cents,
                note: lineNotes[line.lineId] ?? '',
              };
            })}
          />
          <ModalFooterActions
            note={footerNote}
            rightActions={
              <Button type='button' onClick={() => setIsChoosing(false)}>
                {CONFIRM_WORDS.adjustedDone}
              </Button>
            }
          />
        </div>
      )}
      <div className={join(isChoosing && 'hidden')}>{formBody}</div>
    </FormSheet>
  );
}

export default ConfirmSheet;
