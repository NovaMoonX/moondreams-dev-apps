import { useState } from 'react';
import { ArrowLeftRight, CreditCard, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import SectionDivider from '@/components/SectionDivider';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import PairOffer from '@apps/runway/components/PairOffer';
import SheetHead from '@apps/runway/components/SheetHead';
import { NEEDS_HOME_WORDS, PAIR_WORDS } from '@apps/runway/constants';
import { useUnpairAccounts } from '@apps/runway/hooks/useBankMatch';
import {
  selectAccountPairs,
  selectAllCards,
  selectWaitingBankMoves,
  type AccountPairEntry,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import type { OpenPurchase } from '@apps/runway/types';
import { getPairSideName } from '@apps/runway/utils/purchaseText';

interface AccountMovesScreenProps {
  onClose: () => void;
}

const useNames = () => {
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cardNameOf = getCardNamer(useAppSelector(selectAllCards));
  return ({ out, into, kind }: AccountPairEntry) => {
    const from = getPairSideName(out, accounts, cardNameOf);
    const to = getPairSideName(into, accounts, cardNameOf);
    return {
      from,
      to,
      title:
        kind === 'cardPayment'
          ? PAIR_WORDS.cardPaymentRow(to)
          : PAIR_WORDS.rowName(from, to),
      text:
        kind === 'cardPayment'
          ? PAIR_WORDS.sheetCardPayment(from, to)
          : PAIR_WORDS.sheetTransfer(from, to),
    };
  };
};

function PairSheet({
  pair,
  onClose,
}: {
  pair: AccountPairEntry;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const namesOf = useNames();
  const unpairPair = useUnpairAccounts();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { title, text } = namesOf(pair);

  const unpair = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await unpairPair(user.uid, pair);
      onClose();
    } catch (unpairError) {
      setError(getErrorMessage(unpairError, PAIR_WORDS.unpairFailed));
      setIsBusy(false);
    }
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={title}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <SheetHead
          label={PAIR_WORDS.screenTitle}
          figure={formatCents(pair.out.amountCents)}
          fact={formatDateOrdinalUTC(pair.out.date)}
        />
        <p className='text-muted-foreground text-sm'>{text}</p>
        <ActionGroup isRoomy>
          <ActionRow
            isGrouped
            isRoomy
            icon={<Undo2 />}
            label={PAIR_WORDS.unpair}
            subtitle={error ?? PAIR_WORDS.unpairSub}
            isDisabled={isBusy}
            onClick={() => void unpair()}
          />
        </ActionGroup>
      </div>
    </FormSheet>
  );
}

const isCardPaymentKind = (purchase: OpenPurchase) =>
  purchase.category === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

const formatSigned = (cents: number) =>
  cents < 0 ? `+${formatCents(-cents)}` : formatCents(cents);

const useSideName = () => {
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cardNameOf = getCardNamer(useAppSelector(selectAllCards));
  return (purchase: OpenPurchase) =>
    getPairSideName(purchase, accounts, cardNameOf);
};

const getMoveTitle = (purchase: OpenPurchase) =>
  purchase.label?.trim() ||
  purchase.merchant?.trim() ||
  purchase.bankName?.trim() ||
  PAIR_WORDS.screenTitle;

/** A card payment or move the bank flagged that is not paired yet: pair it with its other side, say it is spending, or say the other side is an account Runway doesn't see. */
function WaitingMoveSheet({
  purchase,
  onClose,
}: {
  purchase: OpenPurchase;
  onClose: () => void;
}) {
  const sideName = useSideName();
  const isOut = purchase.amountCents > 0;
  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={getMoveTitle(purchase)}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <SheetHead
          label={
            isCardPaymentKind(purchase)
              ? PAIR_WORDS.waitingCardPayment
              : PAIR_WORDS.waitingTransfer
          }
          figure={formatSigned(purchase.amountCents)}
          fact={`${formatDateOrdinalUTC(purchase.date)} · ${sideName(purchase)}`}
        />
        <PairOffer
          purchase={purchase}
          onDone={onClose}
        >
          <ActionGroup isRoomy>
            {isOut && (
              <LeaveOutRow
                purchase={purchase}
                onDone={onClose}
                isKeepFree
                label={PAIR_WORDS.isSpending}
                subtitle={PAIR_WORDS.isSpendingSub}
              />
            )}
            <LeaveOutRow
              purchase={purchase}
              onDone={onClose}
              label={isOut ? undefined : NEEDS_HOME_WORDS.unseenIn}
            />
          </ActionGroup>
        </PairOffer>
      </div>
    </FormSheet>
  );
}

/** Every pair of purchases Runway recorded as a move between the person's own accounts, newest first, each opening a sheet where it can be sent back to Needs a home. */
function AccountMovesScreen({ onClose }: AccountMovesScreenProps) {
  const pairs = useAppSelector(selectAccountPairs);
  const waiting = useAppSelector(selectWaitingBankMoves);
  const namesOf = useNames();
  const sideName = useSideName();
  const [openId, setOpenId] = useState<string | null>(null);
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const opened = pairs.find((pair) => pair.out.id === openId) ?? null;
  const openedWaiting =
    waiting.find((purchase) => purchase.id === waitingId) ?? null;

  return (
    <Subview
      title={PAIR_WORDS.screenTitle}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {waiting.length > 0 && (
          <div className='space-y-2'>
            <SectionDivider label={PAIR_WORDS.waitingTitle} />
            <p className='text-muted-foreground text-sm'>
              {PAIR_WORDS.waitingIntro}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {waiting.map((purchase) => {
                const title = getMoveTitle(purchase);
                const detail = `${formatDateOrdinalUTC(purchase.date)} · ${sideName(purchase)}`;
                const figure = formatSigned(purchase.amountCents);
                return (
                  <ItemRow
                    key={purchase.id}
                    name={title}
                    leading={
                      <span
                        className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
                        aria-hidden='true'
                      >
                        {isCardPaymentKind(purchase) ? (
                          <CreditCard className='h-4 w-4' />
                        ) : (
                          <ArrowLeftRight className='h-4 w-4' />
                        )}
                      </span>
                    }
                    detail={detail}
                    figure={figure}
                    ariaLabel={`${title}, ${figure}, ${detail}. Open`}
                    onOpen={() => setWaitingId(purchase.id)}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {waiting.length > 0 && pairs.length > 0 && (
          <SectionDivider label={PAIR_WORDS.pairedTitle} />
        )}
        {pairs.length === 0 ? (
          waiting.length === 0 && (
            <p className='text-muted-foreground text-sm'>{PAIR_WORDS.empty}</p>
          )
        ) : (
          <>
            <p className='text-muted-foreground text-sm'>
              {PAIR_WORDS.screenIntro}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {pairs.map((pair) => {
                const { from, title } = namesOf(pair);
                const detail = [
                  formatDateOrdinalUTC(pair.out.date),
                  ...(pair.kind === 'cardPayment' ? [from] : []),
                ].join(' · ');
                const figure = formatCents(pair.out.amountCents);
                return (
                  <ItemRow
                    key={pair.out.id}
                    name={title}
                    leading={
                      <span
                        className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
                        aria-hidden='true'
                      >
                        {pair.kind === 'cardPayment' ? (
                          <CreditCard className='h-4 w-4' />
                        ) : (
                          <ArrowLeftRight className='h-4 w-4' />
                        )}
                      </span>
                    }
                    detail={detail}
                    figure={figure}
                    ariaLabel={`${title}, ${figure}, ${detail}. Open`}
                    onOpen={() => setOpenId(pair.out.id)}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>
      {openedWaiting !== null && (
        <WaitingMoveSheet
          key={openedWaiting.id}
          purchase={openedWaiting}
          onClose={() => setWaitingId(null)}
        />
      )}
      {opened !== null && (
        <PairSheet
          key={opened.out.id}
          pair={opened}
          onClose={() => setOpenId(null)}
        />
      )}
    </Subview>
  );
}

export default AccountMovesScreen;
