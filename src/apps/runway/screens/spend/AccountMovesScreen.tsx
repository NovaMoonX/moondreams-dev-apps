import { useState } from 'react';
import { Undo2 } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

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
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import SheetHead from '@apps/runway/components/SheetHead';
import { NEEDS_HOME_WORDS, PAIR_WORDS } from '@apps/runway/constants';
import { usePairAccountsWithUndo } from '@apps/runway/hooks/useBankMatch';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { unpairAccountPurchases } from '@apps/runway/store/actions/purchaseActions';
import {
  selectAccountPairs,
  selectAllCards,
  type AccountPairEntry,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeAccountPair,
  getPairSideName,
} from '@apps/runway/utils/purchaseText';

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
  const { addToast } = useToast();
  const namesOf = useNames();
  const pairAccounts = usePairAccountsWithUndo();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { from, to, title, text } = namesOf(pair);
  const names = { from, to };

  const unpair = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const uid = user.uid;
      const back = await unpairAccountPurchases(
        uid,
        await getRunwayEncryption(uid),
        pair.out,
        pair.into,
        describeAccountPair(pair.out, pair.into, pair.kind, names, true),
      );
      addToast({
        title: PAIR_WORDS.unpaired,
        type: 'success',
        action: {
          label: NEEDS_HOME_WORDS.undo,
          onClick: () =>
            void pairAccounts(
              uid,
              [{ out: back.out, into: back.into, kind: pair.kind }],
              'person',
              true,
            ).catch((undoError: unknown) =>
              addToast({
                title: NEEDS_HOME_WORDS.undoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
      });
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
          label={PAIR_WORDS.doorTitle}
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
      title={PAIR_WORDS.doorTitle}
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
                    leading={<ItemBadge name={title} emoji={null} />}
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
