import { useEffect, useRef, useState } from 'react';

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
import SummaryRow from '@/components/SummaryRow';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  LineAmountList,
  LineAmountView,
} from '@apps/runway/components/LineAmounts';
import {
  CONFIRM_WORDS,
  DRAFT_WORDS,
  FORM_FLOW_WORDS,
  MAX_NOTE_LENGTH,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  countUnresolvedHolds,
  toRecordLines,
} from '@apps/runway/engine/confirm';
import {
  applyLineEdits,
  getRemainder,
  sumLines,
  suggestShortfall,
} from '@apps/runway/engine/differences';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  confirmDay,
  DayChangedElsewhere,
} from '@apps/runway/store/actions/dayActions';
import type { DraftView } from '@apps/runway/store/selectors/runwaySelectors';
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

/** Asks the amount that arrived and the day it did, and confirms the day. Needs a connection: the day and its two records are written together. */
function ConfirmSheet({ view, stance, onClose }: ConfirmSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isMounted = useRef(true);
  const { day, draft } = view;
  const today = todayAsUtcDate();
  const initialData: ConfirmFormData = {
    amount: centsToInputValue(draft.moneyCents),
    arrivedOn: toDateInputValue(today),
    note: '',
  };
  const [formData, setFormData] = useState<ConfirmFormData>(initialData);
  const [isNoting, setIsNoting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [lineSearch, setLineSearch] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const arrivedCents = parseMoneyToCents(formData.amount);
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
  const editingIndex = lines.findIndex((line) => line.lineId === editingLineId);
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
  const remainder =
    arrivedCents === null ? 0 : getRemainder(arrivedCents, adjusted);

  const getBlocker = () => {
    if (countUnresolvedHolds(draft) > 0) return CONFIRM_WORDS.holds;
    if (arrivedCents === null || arrivedCents <= 0)
      return CONFIRM_WORDS.needsAmount;
    if (arrivedOn === null || arrivedOn > today) return CONFIRM_WORDS.needsDate;
    if (hasBadLine) return CONFIRM_WORDS.needsLineAmount;
    if (remainder < 0)
      return `The lines take ${formatCents(-remainder)} more than arrived. Lower a line or raise the amount.`;
    return null;
  };
  const blocker = getBlocker();

  const getEffect = () => {
    if (arrivedCents === null || arrivedCents <= 0 || difference === 0)
      return null;
    const amount = formatCents(Math.abs(difference));
    if (changedCount > 0) {
      const lead =
        difference > 0
          ? FORM_FLOW_WORDS.moreShort(amount)
          : FORM_FLOW_WORDS.lessShort(amount);
      return FORM_FLOW_WORDS.differenceWithLines(
        lead,
        formatCents(Math.max(0, remainder)),
      );
    }
    if (difference > 0) return FORM_FLOW_WORDS.moreThanPlanned(amount);
    return remainder < 0
      ? FORM_FLOW_WORDS.lessThanLeft(amount)
      : FORM_FLOW_WORDS.lessThanPlanned(amount);
  };
  const effect = getEffect();

  const openLines = () => {
    if (arrivedCents !== null && Object.keys(lineInputs).length === 0) {
      const need = sumLines(lines) - arrivedCents;
      if (need > 0)
        setLineInputs(toInputs(suggestShortfall(lines, need), lines));
    }
    setIsChoosing(true);
  };

  const applyLowestFirst = () => {
    const need = arrivedCents === null ? 0 : sumLines(lines) - arrivedCents;
    setLineInputs(toInputs(suggestShortfall(lines, need), lines));
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
      Object.keys(lineNotes).length > 0,
    onClose,
    isBusy: isSaving,
  });

  const setField = (patch: Partial<ConfirmFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const formBody = (
    <div className='space-y-5'>
      <AmountHero
        label={CONFIRM_WORDS.amount}
        value={formData.amount}
        onChange={(amount) => setField({ amount })}
        disabled={isSaving}
        suffix={
          effect ? (
            <p className='text-muted-foreground' role='status'>
              {effect}
            </p>
          ) : undefined
        }
      />
      {arrivedCents !== null && arrivedCents > 0 && (
        <SummaryRow
          label='Lines'
          ariaLabel={`Lines, ${changedCount > 0 ? FORM_FLOW_WORDS.linesChanged(changedCount) : FORM_FLOW_WORDS.linesAsPlanned}, change`}
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
        note={error ?? blocker}
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
    <FormSheet isOpen onClose={requestClose} title={CONFIRM_WORDS.sheetTitle}>
      {isChoosing && editingIndex >= 0 && (
        <LineAmountView
          name={
            lines[editingIndex].name === '' ? 'Bill' : lines[editingIndex].name
          }
          value={
            Object.hasOwn(lineInputs, lines[editingIndex].lineId)
              ? lineInputs[lines[editingIndex].lineId]
              : centsToInputValue(lines[editingIndex].cents)
          }
          onChange={(text) => setLineInput(lines[editingIndex].lineId, text)}
          onBack={() => setEditingLineId(null)}
          plannedCents={lines[editingIndex].cents}
          isChanged={adjusted[editingIndex].cents !== lines[editingIndex].cents}
          note={{
            value: lineNotes[lines[editingIndex].lineId] ?? '',
            placeholder: CONFIRM_WORDS.lineNotePlaceholder,
            onChange: (text) =>
              setLineNotes((current) => ({
                ...current,
                [lines[editingIndex].lineId]: text,
              })),
          }}
          isDisabled={isSaving}
          footerNote={error ?? blocker}
        />
      )}
      {isChoosing && editingIndex < 0 && (
        <div className='space-y-3'>
          <div className='space-y-3'>
            <BackLink onBack={() => setIsChoosing(false)} />
            <div className='space-y-1'>
              <InlineNotice tone='info'>
                {CONFIRM_WORDS.adjustIntro}
              </InlineNotice>
              <p className='text-sm font-medium'>
                {DRAFT_WORDS.dayLeft} {formatCents(remainder)}
                <span className='text-muted-foreground font-normal'>
                  {' '}
                  of {arrivedCents === null ? '' : formatCents(arrivedCents)}
                </span>
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {remainder < 0 && (
                <RevealChip onClick={applyLowestFirst}>
                  {CONFIRM_WORDS.lowestFirst}
                </RevealChip>
              )}
              {Object.keys(lineInputs).length > 0 && (
                <RevealChip
                  onClick={() => {
                    setLineInputs({});
                    setLineNotes({});
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
                placeholder='Find a line'
              />
            )}
            {visibleLines.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                No line matches that.
              </p>
            )}
          </div>
          <LineAmountList
            className='max-h-[max(9rem,calc(92dvh-29rem))] [@media(max-height:499px)]:max-h-none'
            onOpen={setEditingLineId}
            items={visibleLines.map(({ line, index }) => {
              const original = lines[index];
              return {
                id: line.lineId,
                name: original.name === '' ? 'Bill' : original.name,
                emoji: original.emoji,
                cents: line.cents,
                detail:
                  line.cents !== original.cents
                    ? `${CONFIRM_WORDS.planned} ${formatCents(original.cents)}`
                    : null,
              };
            })}
          />
          <ModalFooterActions
            note={error ?? blocker}
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
