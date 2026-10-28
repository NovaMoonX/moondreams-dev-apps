import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import SummaryRow from '@/components/SummaryRow';
import { useAuth } from '@/hooks/useAuth';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import { CONFIRM_WORDS, MAX_NOTE_LENGTH } from '@apps/runway/constants';
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

const { custom } = FormFactories;

const LINE_SEARCH_THRESHOLD = 8;

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
      return `Choose where ${formatCents(-remainder)} comes from, or lower the lines.`;
    return null;
  };
  const blocker = getBlocker();

  const getEffect = () => {
    if (arrivedCents === null || arrivedCents <= 0) return null;
    const free = `Free to spend holds ${formatCents(Math.max(0, remainder))}.`;
    if (difference === 0)
      return changedCount > 0
        ? `${CONFIRM_WORDS.sameAsExpected} ${free}`
        : CONFIRM_WORDS.sameAsExpected;
    if (difference > 0) {
      const lead = `${formatCents(difference)} more than expected.`;
      return changedCount > 0
        ? `${lead} ${free}`
        : `${lead} ${CONFIRM_WORDS.extraTo} ${free}`;
    }
    const lead = `${formatCents(-difference)} less than expected.`;
    if (changedCount > 0) return `${lead} ${free}`;
    return remainder < 0
      ? `${lead} That is more than Free to spend holds.`
      : `${lead} ${CONFIRM_WORDS.shortFrom} ${free}`;
  };
  const effect = getEffect();

  const getDoorLabel = () => {
    if (difference > 0)
      return `Choose where the ${formatCents(difference)} goes`;
    if (difference < 0)
      return `Choose where the ${formatCents(-difference)} comes from`;
    return CONFIRM_WORDS.adjustLines;
  };

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

  const fields = [
    custom({
      name: 'amount',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            {CONFIRM_WORDS.amount}
          </p>
          <MoneyInput
            variant='outline'
            ariaLabel={CONFIRM_WORDS.amount}
            value={props.value as string}
            onChange={props.onValueChange}
            disabled={isSaving}
          />
          {effect && <p className='text-muted-foreground text-xs'>{effect}</p>}
          {arrivedCents !== null && arrivedCents > 0 && (
            <SummaryRow
              label='Lines'
              onClick={openLines}
              detail={
                changedCount > 0
                  ? `${changedCount} ${changedCount === 1 ? 'line' : 'lines'} changed`
                  : undefined
              }
            >
              {getDoorLabel()}
            </SummaryRow>
          )}
        </div>
      ),
    }),
    custom({
      name: 'arrivedOn',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>{CONFIRM_WORDS.date}</p>
          <Input
            type='date'
            variant='outline'
            aria-label={CONFIRM_WORDS.date}
            max={toDateInputValue(today)}
            value={props.value as string}
            disabled={isSaving}
            onChange={(event) => props.onValueChange(event.target.value)}
          />
        </div>
      ),
    }),
    custom({
      name: 'note',
      label: '',
      renderComponent: (props) => {
        if (difference === 0) return null;
        if (!isNoting && (props.value as string) === '') {
          return (
            <div>
              <RevealChip
                icon={<Plus className='h-4 w-4' />}
                onClick={() => setIsNoting(true)}
              >
                {CONFIRM_WORDS.note}
              </RevealChip>
            </div>
          );
        }
        return (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>Note</p>
            <Input
              variant='outline'
              aria-label='Note on the difference'
              maxLength={MAX_NOTE_LENGTH}
              placeholder={CONFIRM_WORDS.notePlaceholder}
              value={props.value as string}
              disabled={isSaving}
              onChange={(event) => props.onValueChange(event.target.value)}
            />
          </div>
        );
      },
    }),
  ];

  return (
    <FormSheet isOpen onClose={onClose} title={CONFIRM_WORDS.sheetTitle}>
      {isChoosing && (
        <div className='space-y-3'>
          <BackLink onBack={() => setIsChoosing(false)} />
          <div className='space-y-1'>
            <p className='text-muted-foreground text-sm'>
              {CONFIRM_WORDS.adjustIntro}
            </p>
            <p className='text-sm font-medium'>
              Free to spend {formatCents(remainder)}
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
          {adjusted.length >= LINE_SEARCH_THRESHOLD && (
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
          <ul className='border-border divide-border divide-y rounded-2xl border'>
            {visibleLines.map(({ line, index }) => {
              const original = lines[index];
              const isChanged = line.cents !== original.cents;
              const name = original.name === '' ? 'Bill' : original.name;
              return (
                <li key={line.lineId} className='space-y-2 p-3'>
                  <div className='flex items-start gap-3'>
                    <ItemBadge name={name} emoji={original.emoji} />
                    <div className='min-w-0 flex-1 space-y-1'>
                      <p className='line-clamp-2 font-medium break-words'>
                        {name}
                      </p>
                      <PriorityBadge priority={original.tier} />
                    </div>
                  </div>
                  <MoneyInput
                    variant='outline'
                    ariaLabel={`${name} amount`}
                    value={
                      Object.hasOwn(lineInputs, line.lineId)
                        ? lineInputs[line.lineId]
                        : centsToInputValue(original.cents)
                    }
                    onChange={(text) => setLineInput(line.lineId, text)}
                    disabled={isSaving}
                  />
                  {isChanged && (
                    <div className='space-y-1.5'>
                      <p className='text-muted-foreground text-xs'>
                        {CONFIRM_WORDS.planned} {formatCents(original.cents)}
                      </p>
                      <Input
                        variant='outline'
                        aria-label={`Note on ${name}`}
                        maxLength={MAX_NOTE_LENGTH}
                        placeholder={CONFIRM_WORDS.lineNotePlaceholder}
                        value={lineNotes[line.lineId] ?? ''}
                        disabled={isSaving}
                        onChange={(event) =>
                          setLineNotes((current) => ({
                            ...current,
                            [line.lineId]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
      <div className={join(isChoosing && 'hidden')}>
        <Form
          id='runway-confirm-day'
          form={fields}
          initialData={initialData}
          columns={1}
          onDataChange={(data) => setFormData(data as ConfirmFormData)}
          onSubmit={() => {
            void handleConfirm();
          }}
          submitButton={
            <ModalFooterActions
              note={error ?? blocker}
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              }
              rightActions={
                <Button
                  type='submit'
                  loading={isSaving}
                  disabled={isSaving || blocker !== null}
                >
                  {CONFIRM_WORDS.confirm}
                </Button>
              }
            />
          }
        />
      </div>
    </FormSheet>
  );
}

export default ConfirmSheet;
