import { useState } from 'react';

import ActionGroup from '@/components/ActionGroup';
import FormSheet from '@/components/FormSheet';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import SheetHead from '@apps/runway/components/SheetHead';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import {
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
  onOpen,
}: {
  purchase: OpenPurchase;
  sourceName: string;
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

/** Purchases that came in from a linked bank and wait for an envelope; money in waits apart, until deposits are matched to pay. */
function NeedsHomeScreen({ onClose }: NeedsHomeScreenProps) {
  const { spending, moneyIn } = useAppSelector(selectNeedsHome);
  const isLoaded = useAppSelector(selectIsNeedsHomeLoaded);
  const sourceNameOf = useSourceName();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened =
    [...spending, ...moneyIn].find((entry) => entry.id === openId) ?? null;

  const renderRows = (rows: readonly OpenPurchase[]) => (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map((purchase) => (
        <NeedsHomeRow
          key={purchase.id}
          purchase={purchase}
          sourceName={sourceNameOf(purchase)}
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
        ) : spending.length + moneyIn.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.empty}
          </p>
        ) : (
          <>
            <p className='text-muted-foreground text-sm'>
              {NEEDS_HOME_WORDS.intro}
            </p>
            {spending.length > 0 && renderRows(spending)}
            {moneyIn.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider label={NEEDS_HOME_WORDS.moneyIn} />
                <p className='text-muted-foreground text-sm'>
                  {NEEDS_HOME_WORDS.moneyInHelp}
                </p>
                {renderRows(moneyIn)}
              </div>
            )}
          </>
        )}
      </div>
      {opened !== null && opened.amountCents >= 0 && (
        <PurchaseScreen
          key={opened.id}
          purchaseId={opened.id}
          fallback={opened}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
          hasGroupLink={false}
        />
      )}
      {opened !== null && opened.amountCents < 0 && (
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
