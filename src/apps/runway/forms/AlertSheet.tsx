import { useState } from 'react';

import { Type } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup } from '@/components/PillGroup';
import SettingsRow from '@/components/SettingsRow';
import { useAuth } from '@/hooks/useAuth';
import { deferAction } from '@/lib/undo/deferredUndo';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { ALERT_WORDS } from '@apps/runway/constants';
import { ALERT_SHARE_BPS } from '@apps/runway/engine/alerts';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  createAlert,
  deleteAlert,
  updateAlert,
} from '@apps/runway/store/actions/alertActions';
import type {
  AlertLine,
  AlertTarget,
  Cents,
  OpenAlert,
} from '@apps/runway/types';
import { toAlertRemovalKey } from '@apps/runway/utils/alertText';

type Choice = 'half' | 'quarter' | 'zero' | 'amount';

interface AlertSheetProps {
  /** Fixed by where the sheet was opened. */
  target: AlertTarget;
  /** What the envelope gets each time; null when it has no set amount (no share options then) or for Free to Spend. */
  eachTimeCents: Cents | null;
  alert: OpenAlert | null;
  onClose: () => void;
}

const toChoice = (alert: OpenAlert | null): Choice | null => {
  if (alert === null) return null;
  if (alert.line.kind === 'cents') {
    return alert.line.cents === 0 ? 'zero' : 'amount';
  }
  return alert.line.bps === ALERT_SHARE_BPS.half
    ? 'half'
    : alert.line.bps === ALERT_SHARE_BPS.quarter
      ? 'quarter'
      : null;
};

const toLine = (
  choice: Choice | null,
  amountText: string,
): AlertLine | null => {
  if (choice === 'half') return { kind: 'share', bps: ALERT_SHARE_BPS.half };
  if (choice === 'quarter') {
    return { kind: 'share', bps: ALERT_SHARE_BPS.quarter };
  }
  if (choice === 'zero') return { kind: 'cents', cents: 0 };
  if (choice !== 'amount') return null;
  const cents = parseMoneyToCents(amountText);
  return cents === null || cents < 0 ? null : { kind: 'cents', cents };
};

/** Adds, changes or removes one alert on Free to Spend or on an envelope. Removing hides it at once and writes only after its Undo passes. */
function AlertSheet({
  target,
  eachTimeCents,
  alert,
  onClose,
}: AlertSheetProps) {
  const { user } = useAuth();
  const isEnvelope = target.kind === 'envelope';
  const [choice, setChoice] = useState<Choice | null>(() => toChoice(alert));
  const [amountText, setAmountText] = useState(() =>
    alert?.line.kind === 'cents' && alert.line.cents > 0
      ? centsToInputValue(alert.line.cents)
      : '',
  );
  const [isNamed, setIsNamed] = useState(alert?.isNamed ?? false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [
    ...(isEnvelope && eachTimeCents !== null
      ? [
          { value: 'half' as const, label: ALERT_WORDS.half },
          { value: 'quarter' as const, label: ALERT_WORDS.quarter },
        ]
      : []),
    ...(isEnvelope
      ? []
      : [{ value: 'amount' as const, label: ALERT_WORDS.anAmount }]),
    { value: 'zero' as const, label: ALERT_WORDS.runsOut },
    ...(isEnvelope
      ? [{ value: 'amount' as const, label: ALERT_WORDS.anAmount }]
      : []),
  ];
  const line = toLine(choice, amountText);
  const blocker =
    choice === null
      ? ALERT_WORDS.pickOne
      : line === null
        ? ALERT_WORDS.amountMin
        : null;

  const save = async () => {
    if (!user || isBusy || line === null) return;
    setIsBusy(true);
    setError(null);
    const input = { target, line, isNamed: isEnvelope && isNamed };
    try {
      const encryption = await getRunwayEncryption(user.uid);
      if (alert) await updateAlert(user.uid, encryption, alert, input);
      else await createAlert(user.uid, encryption, input);
      onClose();
    } catch {
      setError(ALERT_WORDS.saveFailed);
      setIsBusy(false);
    }
  };

  const remove = () => {
    if (!user || !alert) return;
    const { uid } = user;
    deferAction(toAlertRemovalKey(alert.id), ALERT_WORDS.removed, async () => {
      await deleteAlert(uid, alert.id);
      return null;
    });
    onClose();
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={alert ? ALERT_WORDS.editTitle : ALERT_WORDS.addTitle}
    >
      <div className='space-y-4 pb-4'>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>{ALERT_WORDS.question}</p>
          <PillGroup
            label={ALERT_WORDS.question}
            options={options}
            value={choice}
            onChange={setChoice}
          />
          {choice === 'amount' && (
            <MoneyInput
              variant='outline'
              ariaLabel={ALERT_WORDS.amountLabel}
              value={amountText}
              onChange={setAmountText}
              placeholder={ALERT_WORDS.amountPlaceholder}
              errorMessage={
                amountText !== '' && line === null
                  ? ALERT_WORDS.amountMin
                  : undefined
              }
            />
          )}
        </div>
        {isEnvelope && (
          <ul className='border-border rounded-2xl border px-3'>
            <SettingsRow
              icon={<Type className='size-5' />}
              title={ALERT_WORDS.namedTitle}
              description={ALERT_WORDS.namedHelp}
              control={
                <AppToggle
                  aria-label={ALERT_WORDS.namedTitle}
                  checked={isNamed}
                  onCheckedChange={setIsNamed}
                />
              }
            />
          </ul>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
      <ModalFooterActions
        note={blocker}
        leftActions={
          alert ? (
            <DeleteIconButton
              onClick={remove}
              disabled={isBusy}
              label={ALERT_WORDS.remove}
            />
          ) : undefined
        }
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isBusy}
          >
            {ALERT_WORDS.cancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap'
            disabled={blocker !== null || isBusy}
            onClick={() => void save()}
          >
            {alert ? ALERT_WORDS.save : ALERT_WORDS.saveAlert}
          </Button>
        }
      />
    </FormSheet>
  );
}

export default AlertSheet;
