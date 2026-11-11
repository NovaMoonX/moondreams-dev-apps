import { useState } from 'react';
import { Archive, History, Pencil } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  formatDateOrdinalUTC,
  formatRelativeDayUTC,
} from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import type { HeldChoice } from '@apps/runway/engine/endings';
import {
  getFeeHeldCents,
  getFeePlan,
  isFeeBillLive,
} from '@apps/runway/utils/cardFeePlan';
import ItemRow from '@apps/runway/components/ItemRow';
import LinkToBankRow from '@apps/runway/components/LinkToBankRow';
import { useLinkedFact } from '@apps/runway/hooks/useLinkedFact';
import SheetHead from '@apps/runway/components/SheetHead';
import LinkBankScreen from '@apps/runway/screens/link/LinkBankScreen';
import {
  AUTO_PAY_WORDS,
  CARD_FEE_WORDS,
  CARD_WORDS,
  HELD_WORDS,
} from '@apps/runway/constants';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { archiveCard } from '@apps/runway/store/actions/cardActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllCards,
  selectBillPayments,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
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

/** Bills past this many sit behind a quiet "Show more" row. */
const SHOWN_BILLS = 3;

interface CardBillsProps {
  cardId: string;
  today: number;
  onClose: () => void;
}

/** The live bills charged to a card, so a card's sheet says what will land on it; each opens the bill. Draws nothing when none is. */
function CardBills({ cardId, today, onClose }: CardBillsProps) {
  const { showOnPlan } = useRunwayUrlState();
  const emojiOf = useLiveEmojiResolver();
  const bills = useAppSelector((state) => selectBills(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const [isAll, setIsAll] = useState(false);
  const onCard = bills.filter(
    ({ version }) => (version.payload.paidByCardId ?? null) === cardId,
  );
  if (onCard.length === 0) return null;
  const shown = isAll ? onCard : onCard.slice(0, SHOWN_BILLS);

  return (
    <ActionSection caption={AUTO_PAY_WORDS.cardBills}>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {shown.map(({ item, version }) => {
          const payment =
            (payments[item.id] ?? []).find((entry) => entry.payOn >= today) ??
            null;
          const due =
            payment === null
              ? AUTO_PAY_WORDS.cardBillNoDue
              : AUTO_PAY_WORDS.cardBillLine(
                  formatRelativeDayUTC(
                    payment.dueOn,
                    today,
                    formatDateOrdinalUTC,
                  ),
                );
          return (
            <ItemRow
              key={item.id}
              name={version.payload.name}
              emoji={emojiOf(version.payload.emoji, version.payload.groupId)}
              detail={due}
              figure={payment === null ? null : formatCents(payment.totalCents)}
              ariaLabel={`${version.payload.name}. ${due}. Open`}
              onOpen={() => {
                onClose();
                void showOnPlan('bills', { itemId: item.id });
              }}
            />
          );
        })}
      </ul>
      {onCard.length > SHOWN_BILLS && (
        <ShowMoreButton isOpen={isAll} onClick={() => setIsAll(!isAll)}>
          {isAll
            ? AUTO_PAY_WORDS.cardBillsFewer
            : AUTO_PAY_WORDS.cardBillsMore(onCard.length - SHOWN_BILLS)}
        </ShowMoreButton>
      )}
    </ActionSection>
  );
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
  const [isLinking, setIsLinking] = useState(false);
  const reserveCents = balances.reserveByCard[card.id] ?? 0;
  const today = todayAsUtcDate(useNow(60_000));
  const [view, setView] = useState<'menu' | 'history' | 'purchase' | 'archive'>(
    'menu',
  );
  const [heldChoice, setHeldChoice] = useState<HeldChoice | null>(null);
  const fee = card.annualFee ?? null;
  const isFeeOpen = useAppSelector((state) =>
    fee === null ? false : isFeeBillLive(state, fee.billId),
  );
  const feeHeldCents = isFeeOpen
    ? getFeeHeldCents(balances.assignedByItem, fee)
    : 0;
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

  const linkedFact = useLinkedFact(card.linkId);

  const archive = async (choice: HeldChoice | null) => {
    if (!user || isArchiving) return;
    const feeResult = getFeePlan(store.getState(), {
      cardId: card.id,
      cardName: name,
      before: fee,
      after: null,
      heldChoice: choice,
      today,
    });
    if (feeResult.kind === 'loading') {
      addToast({ title: CARD_FEE_WORDS.loading, type: 'error' });
      return;
    }
    setIsArchiving(true);
    try {
      await archiveCard(
        user.uid,
        await getRunwayEncryption(user.uid),
        card.id,
        CARD_WORDS.changeArchived(name),
        feeResult.plan,
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

  const handleArchive = async () => {
    if (!user || isArchiving) return;
    if (feeHeldCents > 0) {
      setHeldChoice(null);
      setView('archive');
      return;
    }
    const isConfirmed = await confirm({
      title: CARD_WORDS.archiveConfirmTitle(name),
      message:
        reserveCents > 0
          ? mask(CARD_WORDS.archiveWaitingText(formatCents(reserveCents)))
          : CARD_WORDS.archiveSub,
      confirmText: CARD_WORDS.archiveConfirmText,
    });
    if (!isConfirmed) return;
    await archive(null);
  };

  if (isLinking) {
    return (
      <LinkBankScreen
        startedFrom={{ target: 'card', id: card.id }}
        onClose={() => setIsLinking(false)}
      />
    );
  }

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
      {view === 'archive' ? (
        <div className='space-y-4'>
          <BackLink onBack={() => setView('menu')} />
          <ActionTitle>{CARD_FEE_WORDS.archiveTitle(name)}</ActionTitle>
          {reserveCents > 0 && (
            <p className='text-muted-foreground text-sm'>
              {mask(CARD_WORDS.archiveWaitingText(formatCents(reserveCents)))}
            </p>
          )}
          <ActionSection
            caption={mask(
              CARD_FEE_WORDS.heldCaption(formatCents(feeHeldCents)),
            )}
          >
            <HeldChoiceList
              value={heldChoice}
              onChange={setHeldChoice}
              freeBody={CARD_FEE_WORDS.heldFreeBody}
              keepBody={HELD_WORDS.keepBody}
            />
          </ActionSection>
          <Button
            type='button'
            className='w-full'
            loading={isArchiving}
            disabled={heldChoice === null || isArchiving}
            onClick={() => void archive(heldChoice)}
          >
            {CARD_FEE_WORDS.archiveDo}
          </Button>
          {heldChoice === null && (
            <p className='text-muted-foreground text-center text-xs'>
              {CARD_FEE_WORDS.needsHeld}
            </p>
          )}
        </div>
      ) : view === 'history' ? (
        <div className='space-y-4'>
          <div className='flex items-center gap-1'>
            <BackLink isChevronOnly onBack={() => setView('menu')} />
            <p className='min-w-0 text-2xl font-semibold'>
              {CARD_WORDS.historyTitle}
            </p>
          </div>
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
            fact={[
              reserveCents < 0
                ? mask(CARD_WORDS.paidAhead(formatCents(-reserveCents)))
                : describeCardDue(card, today, due),
              linkedFact,
            ]
              .filter(Boolean)
              .join(' \u00b7 ')}
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
            <LinkToBankRow
              linkId={card.linkId}
              onOpen={() => setIsLinking(true)}
            />
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
          <CardBills cardId={card.id} today={today} onClose={onClose} />
        </div>
      )}
    </FormSheet>
  );
}

export default CardSheet;
