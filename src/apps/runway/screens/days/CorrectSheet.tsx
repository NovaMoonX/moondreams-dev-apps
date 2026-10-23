import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import BeforeAfterRow from '@/components/BeforeAfterRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import {
  CONFIRM_WORDS,
  CORRECT_WORDS,
  DRAFT_WORDS,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import {
  buildCorrection,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import { getRemainder } from '@apps/runway/engine/differences';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  correctDay,
  DayChangedElsewhere,
} from '@apps/runway/store/actions/dayActions';
import {
  selectConfirmedByItem,
  selectOpenDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, CorrectionChange } from '@apps/runway/types';

const LINE_SEARCH_THRESHOLD = 8;

interface CorrectSheetProps {
  dayKey: string;
  base: EffectiveSplit;
  onClose: () => void;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Corrects a confirmed day in two steps: the amounts, then what the change does to the envelopes, goals and bills before it is written. Needs a connection. */
function CorrectSheet({ dayKey, base, onClose }: CorrectSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isMounted = useRef(true);
  const items = useAppSelector((state) => state.runway.items);
  const held = useAppSelector(selectConfirmedByItem);
  const openDay = useAppSelector((state) => selectOpenDay(state, dayKey));
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [amount, setAmount] = useState(centsToInputValue(base.arrivedCents));
  const [lineInputs, setLineInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
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

  const getBlocker = () => {
    if (arrivedCents === null || arrivedCents <= 0)
      return CONFIRM_WORDS.needsAmount;
    if (hasBadLine) return CONFIRM_WORDS.needsLineAmount;
    if (remainder < 0)
      return `Choose where ${formatCents(-remainder)} comes from, or lower the lines.`;
    if (!isChanged) return CORRECT_WORDS.nothingChanged;
    return null;
  };
  const blocker = getBlocker();

  const searchText = search.trim().toLowerCase();
  const visibleLines = base.lines.filter(
    (line) =>
      searchText === '' ||
      Object.hasOwn(edits, line.lineId) ||
      (line.name === '' ? DRAFT_WORDS.billFallback : line.name)
        .toLowerCase()
        .includes(searchText),
  );

  const kindOf = (itemId: string) =>
    items.find((item) => item.id === itemId)?.kind ?? null;

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

  const ticked = new Set(openDay?.doneLineIds ?? []);
  const hasUntick = changes.some((change) => ticked.has(change.lineId));

  const handleSave = async () => {
    if (!user || blocker !== null || arrivedCents === null) return;
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
    <FormSheet isOpen onClose={onClose} title={CORRECT_WORDS.sheetTitle}>
      {step === 'edit' ? (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>{CORRECT_WORDS.intro}</p>
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {CONFIRM_WORDS.amount}
            </p>
            <MoneyInput
              variant='outline'
              ariaLabel={CONFIRM_WORDS.amount}
              value={amount}
              onChange={setAmount}
            />
            <p className='text-sm font-medium'>
              Free to spend {formatCents(remainder)}
              <span className='text-muted-foreground font-normal'>
                {' '}
                of {arrivedCents === null ? '' : formatCents(arrivedCents)}
              </span>
            </p>
          </div>
          {base.lines.length >= LINE_SEARCH_THRESHOLD && (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder='Find a line'
            />
          )}
          {visibleLines.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              No line matches that.
            </p>
          )}
          <ul className='border-border divide-border max-h-[max(12rem,calc(92dvh-30rem))] divide-y overflow-y-auto rounded-2xl border'>
            {visibleLines.map((line) => {
              const name =
                line.name === '' ? DRAFT_WORDS.billFallback : line.name;
              return (
                <li key={line.lineId} className='space-y-2 p-3'>
                  <div className='flex items-start gap-3'>
                    <ItemBadge name={name} emoji={line.emoji} />
                    <div className='min-w-0 flex-1 space-y-1'>
                      <p className='line-clamp-2 font-medium break-words'>
                        {name}
                      </p>
                      <PriorityBadge priority={line.tier} />
                    </div>
                  </div>
                  <MoneyInput
                    variant='outline'
                    ariaLabel={`${name} amount`}
                    value={
                      Object.hasOwn(lineInputs, line.lineId)
                        ? lineInputs[line.lineId]
                        : centsToInputValue(line.cents)
                    }
                    onChange={(text) =>
                      setLineInputs((current) => ({
                        ...current,
                        [line.lineId]: text,
                      }))
                    }
                  />
                </li>
              );
            })}
          </ul>
          <ModalFooterActions
            note={blocker}
            cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
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
          <p className='text-sm font-medium'>{CORRECT_WORDS.reviewTitle}</p>
          {corrected && (
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {corrected.arrivedCents !== base.arrivedCents && (
                <BeforeAfterRow
                  title='Money that arrived'
                  before={formatCents(base.arrivedCents)}
                  after={formatCents(corrected.arrivedCents)}
                  beforeLabel={CORRECT_WORDS.confirmed}
                  afterLabel={CORRECT_WORDS.corrected}
                />
              )}
              <BeforeAfterRow
                title={DRAFT_WORDS.freeToSpend}
                before={formatCents(base.freeToSpendCents)}
                after={formatCents(corrected.freeToSpendCents)}
                beforeLabel={CORRECT_WORDS.confirmed}
                afterLabel={CORRECT_WORDS.corrected}
              />
              {changes.map((change) => {
                const effect = getEffectText(change);
                return (
                  <BeforeAfterRow
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
                          {effect}
                        </p>
                      ) : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
          {hasUntick && (
            <p className='text-muted-foreground text-sm'>
              {CORRECT_WORDS.untickedNote}
            </p>
          )}
          {!isNoting && note === '' ? (
            <div>
              <RevealChip
                icon={<Plus className='h-4 w-4' />}
                onClick={() => setIsNoting(true)}
              >
                {CORRECT_WORDS.note}
              </RevealChip>
            </div>
          ) : (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>Note</p>
              <Input
                variant='outline'
                aria-label='Note on the correction'
                maxLength={MAX_NOTE_LENGTH}
                placeholder={CORRECT_WORDS.notePlaceholder}
                value={note}
                disabled={isSaving}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}
          <ModalFooterActions
            note={error}
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
