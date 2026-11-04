import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import {
  HORIZON_WORDS,
  MAX_PURCHASE_CENTS,
  MOVE_WORDS,
} from '@apps/runway/constants';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
} from '@apps/runway/store/actions/transferActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

const FREE = 'free';
const OUTSIDE = 'outside';

interface PutTowardViewProps {
  itemId: string;
  name: string;
  today: number;
  /** An amount to start the field on; the person can change it. */
  initialCents?: number | null;
  onBack: () => void;
}

/** The view a Horizon item's sheet swaps in to put more money toward it from Free to Spend, an envelope or goal, or from outside the plan. */
function PutTowardView({
  itemId,
  name,
  today,
  initialCents = null,
  onBack,
}: PutTowardViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const undoMove = useUndoTransfer();
  const balances = useAppSelector(selectBalances);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const emojiOf = useLiveEmojiResolver();
  const [moveId] = useState(newTransferMoveId);
  const [amount, setAmount] = useState(() =>
    initialCents === null || isHidden ? '' : centsToInputValue(initialCents),
  );
  const [pick, setPick] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const places = [
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      emoji: emojiOf(version.payload.emoji, version.payload.groupId),
    })),
    ...goals
      .filter(({ version }) => version.payload.state !== 'paused')
      .map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        emoji: version.payload.emoji,
      })),
  ];
  const options: PillOption<string>[] = [
    { value: FREE, label: MOVE_WORDS.freeToSpend },
    { value: OUTSIDE, label: HORIZON_WORDS.putMoreOutside },
    ...places.map(({ id, name: placeName, emoji }) => ({
      value: id,
      label: placeName,
      emoji: emoji ?? undefined,
    })),
  ];

  const parsed = parseMoneyToCents(amount);
  const cents =
    parsed !== null && parsed > 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const getFromName = () => {
    if (pick === FREE) return MOVE_WORDS.freeToSpend;
    if (pick === OUTSIDE) return HORIZON_WORDS.putOutsideName;
    return places.find(({ id }) => id === pick)?.name ?? null;
  };
  const fromName = getFromName();
  const getLeftCents = () => {
    if (pick === OUTSIDE) return Infinity;
    if (pick === FREE) {
      return balances.hasMoney
        ? Math.max(0, balances.freeToSpendCents)
        : Infinity;
    }
    return Math.max(0, balances.assignedByItem[pick ?? ''] ?? 0);
  };
  const leftCents = getLeftCents();
  const getBlocker = () => {
    if (cents === null) return HORIZON_WORDS.needsPutAmount;
    if (fromName === null) return HORIZON_WORDS.needsPutMoreFrom;
    if (cents > leftCents) {
      return isHidden
        ? HORIZON_WORDS.putShowToCheck(fromName)
        : HORIZON_WORDS.putTooMuch(fromName);
    }
    return null;
  };
  const blocker = getBlocker();

  const put = async () => {
    if (
      isSavingRef.current ||
      !user ||
      cents === null ||
      fromName === null ||
      blocker !== null
    ) {
      return;
    }
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    const money = formatCents(cents);
    const fromId = pick === FREE || pick === OUTSIDE ? null : pick;
    const isOutside = pick === OUTSIDE;
    const undoText = HORIZON_WORDS.putUndone(money, name, fromName);
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const date = await moveLeftover(user.uid, encryption, {
        moveId,
        fromId,
        toId: itemId,
        cents,
        isOutside,
        leftCents: leftCents === Infinity ? 0 : leftCents,
        note: null,
        summary: HORIZON_WORDS.putAdded(money, fromName, name),
        undoText,
      });
      addToast({
        title: mask(HORIZON_WORDS.putMoreDone(money, name)),
        type: 'success',
        action: {
          label: MOVE_WORDS.undo,
          onClick: () =>
            void undoMove({
              moveId,
              bill: null,
              date,
              fromId,
              toId: itemId,
              cents,
              note: null,
              isOutside,
              undoText,
            }),
        },
      });
      onBack();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? MOVE_WORDS.offline
          : getErrorMessage(saveError, MOVE_WORDS.failed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.putMoreTitle}</ActionTitle>
      <AmountHero
        label={HORIZON_WORDS.putMoreAmount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
      />
      <ActionSection caption={HORIZON_WORDS.putMoreFrom}>
        <PillGroup
          label={HORIZON_WORDS.putMorePlaces}
          options={options}
          value={pick}
          onChange={setPick}
        />
        <p className='text-muted-foreground mt-2 min-h-5 text-sm'>
          {fromName !== null && leftCents !== Infinity && (
            <MaskedText>
              {HORIZON_WORDS.putHolds(fromName, formatCents(leftCents))}
            </MaskedText>
          )}
        </p>
      </ActionSection>
      <ModalFooterActions
        note={error ?? blocker ?? '\u00A0'}
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
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void put()}
          >
            {cents === null
              ? HORIZON_WORDS.putMoreEmpty
              : mask(HORIZON_WORDS.putMoreAction(formatCents(cents)))}
          </Button>
        }
      />
    </div>
  );
}

export default PutTowardView;
