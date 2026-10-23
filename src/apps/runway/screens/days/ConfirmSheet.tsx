import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { CONFIRM_WORDS, MAX_NOTE_LENGTH } from '@apps/runway/constants';
import {
  countUnresolvedHolds,
  getFreeAfterArrival,
  getLeastArrival,
} from '@apps/runway/engine/confirm';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  confirmDay,
  DayChangedElsewhere,
} from '@apps/runway/store/actions/dayActions';
import type { DraftView } from '@apps/runway/store/selectors/runwaySelectors';
import type { Stance } from '@apps/runway/types';

const { custom } = FormFactories;

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
  const least = getLeastArrival(draft);

  const getBlocker = () => {
    if (countUnresolvedHolds(draft) > 0) return CONFIRM_WORDS.holds;
    if (arrivedCents === null || arrivedCents <= 0)
      return CONFIRM_WORDS.needsAmount;
    if (arrivedOn === null || arrivedOn > today) return CONFIRM_WORDS.needsDate;
    if (arrivedCents < least)
      return `${CONFIRM_WORDS.tooLittle} ${formatCents(least)}.`;
    return null;
  };
  const blocker = getBlocker();

  const getEffect = () => {
    if (arrivedCents === null || arrivedCents <= 0) return null;
    if (difference === 0) return CONFIRM_WORDS.sameAsExpected;
    const free = formatCents(getFreeAfterArrival(draft, arrivedCents));
    return difference > 0
      ? `${formatCents(difference)} more than expected. ${CONFIRM_WORDS.extraTo} It holds ${free}.`
      : `${formatCents(-difference)} less than expected. ${CONFIRM_WORDS.shortFrom} It holds ${free}.`;
  };
  const effect = getEffect();

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
    </FormSheet>
  );
}

export default ConfirmSheet;
