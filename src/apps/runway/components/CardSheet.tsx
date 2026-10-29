import { useState } from 'react';
import { Archive, History, Pencil } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import SheetHead from '@apps/runway/components/SheetHead';
import { CARD_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { archiveCard } from '@apps/runway/store/actions/cardActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard } from '@apps/runway/types';
import { useNow } from '@/hooks/useNow';
import CardHistoryView from '@apps/runway/components/CardHistoryView';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import {
  describeCardDue,
  getCardDueNow,
  getCardName,
} from '@apps/runway/utils/cardText';

interface CardSheetProps {
  card: OpenCard;
  onClose: () => void;
  onPay: () => void;
  onChange: () => void;
}

/** What a card row opens: what it waits for as the figure, then paying it off, changing it, archiving it and its history. */
function CardSheet({ card, onClose, onPay, onChange }: CardSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const cards = useAppSelector(selectAllCards);
  const balances = useAppSelector(selectBalances);
  const [isArchiving, setIsArchiving] = useState(false);
  const reserveCents = balances.reserveByCard[card.id] ?? 0;
  const today = todayAsUtcDate(useNow(60_000));
  const [view, setView] = useState<'menu' | 'history' | 'purchase'>('menu');
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const name = getCardName(card, cards);
  const moves = useAppSelector((state) => state.runway.moves);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? 0,
  );
  const due = getCardDueNow(
    card,
    { [card.id]: reserveCents },
    moves,
    today,
    startDate,
  );

  const handleArchive = async () => {
    if (!user || isArchiving) return;
    const isConfirmed = await confirm({
      title: CARD_WORDS.archiveConfirmTitle(name),
      message:
        reserveCents > 0
          ? mask(CARD_WORDS.archiveWaitingText(formatCents(reserveCents)))
          : CARD_WORDS.archiveSub,
      confirmText: CARD_WORDS.archiveConfirmText,
    });
    if (!isConfirmed) return;
    setIsArchiving(true);
    try {
      await archiveCard(
        user.uid,
        await getRunwayEncryption(user.uid),
        card.id,
        CARD_WORDS.changeArchived(name),
      );
      addToast({ title: CARD_WORDS.archived(name), type: 'success' });
      onClose();
    } catch (error) {
      addToast({
        title: CARD_WORDS.archiveFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
      setIsArchiving(false);
    }
  };

  if (view === 'purchase' && purchaseId !== null) {
    return (
      <PurchaseScreen
        key={purchaseId}
        purchaseId={purchaseId}
        onOpen={setPurchaseId}
        onClose={() => setView('history')}
      />
    );
  }

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={name}
      actions={<ValuesEyeButton />}
    >
      {view === 'history' ? (
        <div className='space-y-4'>
          <BackLink onBack={() => setView('menu')} />
          <p className='text-2xl font-semibold'>{CARD_WORDS.historyTitle}</p>
          <CardHistoryView
            cardId={card.id}
            cardName={name}
            onOpenPurchase={(id) => {
              setPurchaseId(id);
              setView('purchase');
            }}
          />
        </div>
      ) : (
        <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
          <SheetHead
            label={
              reserveCents > 0 ? CARD_WORDS.reserveLabel : CARD_WORDS.allPaid
            }
            figure={formatCents(Math.max(0, reserveCents))}
            fact={
              reserveCents < 0
                ? mask(CARD_WORDS.paidAhead(formatCents(-reserveCents)))
                : describeCardDue(card, today, due)
            }
          />
          <Button
            type='button'
            variant={reserveCents > 0 ? 'primary' : 'secondary'}
            className='w-full'
            onClick={onPay}
          >
            {CARD_WORDS.payOffShort}
          </Button>
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<Pencil />}
              label={CARD_WORDS.change}
              onClick={onChange}
            />
            {card.archivedAt === null && (
              <ActionRow
                isGrouped
                icon={<Archive />}
                label={CARD_WORDS.archive}
                isDisabled={isArchiving}
                onClick={() => void handleArchive()}
              />
            )}
            <ActionRow
              isGrouped
              hasChevron
              icon={<History />}
              label={CARD_WORDS.historyTitle}
              onClick={() => setView('history')}
            />
          </ActionGroup>
        </div>
      )}
    </FormSheet>
  );
}

export default CardSheet;
