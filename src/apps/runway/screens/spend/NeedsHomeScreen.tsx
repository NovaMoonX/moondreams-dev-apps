import { useState } from 'react';

import ActionGroup from '@/components/ActionGroup';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import DepositOffer from '@apps/runway/components/DepositOffer';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PairOffer from '@apps/runway/components/PairOffer';
import ItemRow from '@apps/runway/components/ItemRow';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  DEPOSIT_WORDS,
  NEEDS_HOME_WORDS,
  PAIR_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import {
  selectItemLooks,
  selectIsNeedsHomeLoaded,
  selectNeedsHome,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';

interface NeedsHomeScreenProps {
  onClose: () => void;
}

/** Where a waiting purchase came from: the card or account the bank sent it for. */
const useSourceName = () => {
  const cards = useAppSelector((state) => state.runway.cards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  return (purchase: OpenPurchase) =>
    cards.find((card) => card.id === purchase.paidByCardId)?.name ??
    accounts.find((account) => account.id === purchase.accountId)?.name ??
    NEEDS_HOME_WORDS.fromBank;
};

function MoneyInSheet({
  purchase,
  sourceName,
  onClose,
}: {
  purchase: OpenPurchase;
  sourceName: string;
  onClose: () => void;
}) {
  const title = purchase.merchant?.trim() || NEEDS_HOME_WORDS.moneyIn;

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
          label={NEEDS_HOME_WORDS.moneyIn}
          figure={`+${formatCents(-purchase.amountCents)}`}
          fact={`${formatDateOrdinalUTC(purchase.date)} · ${sourceName}`}
        />
        {purchase.incomeDayId !== null && (
          <p className='text-muted-foreground text-sm'>{DEPOSIT_WORDS.lost}</p>
        )}
        {purchase.pairedWithId !== null && (
          <p className='text-muted-foreground text-sm'>{PAIR_WORDS.lost}</p>
        )}
        {purchase.status === 'posted' && (
          <PairOffer
            purchase={purchase}
            onDone={onClose}
            elseSubtitle={PAIR_WORDS.pickPay}
          >
            <DepositOffer deposit={purchase} onDone={onClose} />
          </PairOffer>
        )}
        <ActionGroup isRoomy>
          <LeaveOutRow purchase={purchase} onDone={onClose} />
        </ActionGroup>
      </div>
    </FormSheet>
  );
}

function NeedsHomeRow({
  purchase,
  sourceName,
  place = null,
  onOpen,
}: {
  purchase: OpenPurchase;
  sourceName: string;
  place?: string | null;
  onOpen: () => void;
}) {
  const { isHidden } = useValuesHidden();
  const isIn = purchase.amountCents < 0;
  const title =
    purchase.label?.trim() ||
    purchase.merchant?.trim() ||
    (isIn ? NEEDS_HOME_WORDS.moneyIn : NEEDS_HOME_WORDS.untitled);
  const detail = [
    formatDateOrdinalUTC(purchase.date),
    ...(purchase.status === 'pending' ? [NEEDS_HOME_WORDS.pending] : []),
    sourceName,
    ...(place === null ? [] : [place]),
  ].join(' · ');
  const amount = isIn
    ? `+${formatCents(-purchase.amountCents)}`
    : formatCents(purchase.amountCents);
  return (
    <ItemRow
      name={title}
      leading={<ItemBadge name={title} emoji={null} />}
      detail={detail}
      figure={amount}
      ariaLabel={`${isHidden ? title : `${title}, ${amount}`}, ${detail}. Open`}
      onOpen={onOpen}
    />
  );
}

/** Purchases that came in from a linked bank and wait for an envelope; money in waits apart, and a deposit that is not clearly a pay day asks which one. */
function NeedsHomeScreen({ onClose }: NeedsHomeScreenProps) {
  const today = todayAsUtcDate();
  const { spending, moneyIn, maybeTwice } = useAppSelector((state) =>
    selectNeedsHome(state, today),
  );
  const isLoaded = useAppSelector(selectIsNeedsHomeLoaded);
  const sourceNameOf = useSourceName();
  const looks = useAppSelector(selectItemLooks);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sent, setSent] = useState<OpenPurchase | null>(null);
  const opened =
    [...spending, ...moneyIn, ...maybeTwice].find(
      (entry) => entry.id === openId,
    ) ?? null;
  const isMoneyIn = opened !== null && opened.amountCents < 0;

  const placeOf = (purchase: OpenPurchase) =>
    NEEDS_HOME_WORDS.inEnvelope(
      purchase.lines
        .map((line) =>
          line.envelopeId === null
            ? null
            : (looks.get(line.envelopeId)?.name ?? null),
        )
        .find((name) => name !== null) ?? 'an envelope',
    );
  const renderRows = (rows: readonly OpenPurchase[], isPlaced = false) => (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map((purchase) => (
        <NeedsHomeRow
          key={purchase.id}
          purchase={purchase}
          sourceName={sourceNameOf(purchase)}
          place={isPlaced ? placeOf(purchase) : null}
          onOpen={() => setOpenId(purchase.id)}
        />
      ))}
    </ul>
  );

  return (
    <Subview
      title={NEEDS_HOME_WORDS.title}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {!isLoaded ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.loading}
          </p>
        ) : spending.length + moneyIn.length + maybeTwice.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.empty}
          </p>
        ) : (
          <>
            <div>
              <HelpTip
                title={NEEDS_HOME_WORDS.title}
                badgeLabel={NEEDS_HOME_WORDS.countedChip}
              >
                <p>{NEEDS_HOME_WORDS.intro}</p>
              </HelpTip>
            </div>
            {spending.length > 0 && renderRows(spending)}
            {maybeTwice.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={NEEDS_HOME_WORDS.maybeTwice}
                  trailing={
                    <HelpTip title={NEEDS_HOME_WORDS.maybeTwice}>
                      <p>{NEEDS_HOME_WORDS.maybeTwiceHelp}</p>
                    </HelpTip>
                  }
                />
                {renderRows(maybeTwice, true)}
              </div>
            )}
            {moneyIn.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={NEEDS_HOME_WORDS.moneyIn}
                  trailing={
                    <HelpTip title={NEEDS_HOME_WORDS.moneyIn}>
                      <p>{NEEDS_HOME_WORDS.moneyInHelp}</p>
                    </HelpTip>
                  }
                />
                {renderRows(moneyIn)}
              </div>
            )}
          </>
        )}
      </div>
      {openId !== null && !isMoneyIn && (
        <PurchaseScreen
          key={openId}
          purchaseId={openId}
          fallback={opened ?? (sent?.id === openId ? sent : null)}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
          onSuggestRule={setSent}
          hasGroupLink={false}
        />
      )}
      {opened !== null && isMoneyIn && (
        <MoneyInSheet
          key={opened.id}
          purchase={opened}
          sourceName={sourceNameOf(opened)}
          onClose={() => setOpenId(null)}
        />
      )}
    </Subview>
  );
}

export default NeedsHomeScreen;
