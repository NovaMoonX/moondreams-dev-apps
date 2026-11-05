import { useState } from 'react';
import { ArrowLeftRight, CreditCard, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
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
import SheetHead from '@apps/runway/components/SheetHead';
import { PAIR_WORDS } from '@apps/runway/constants';
import { useUnpairAccounts } from '@apps/runway/hooks/useBankMatch';
import {
  selectAccountPairs,
  selectAllCards,
  type AccountPairEntry,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
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

/** Every pair of purchases Runway recorded as a move between the person's own accounts, newest first, each opening a sheet where it can be sent back to Needs a home. */
function AccountMovesScreen({ onClose }: AccountMovesScreenProps) {
  const pairs = useAppSelector(selectAccountPairs);
  const namesOf = useNames();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = pairs.find((pair) => pair.out.id === openId) ?? null;

  return (
    <Subview
      title={PAIR_WORDS.screenTitle}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {pairs.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{PAIR_WORDS.empty}</p>
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
