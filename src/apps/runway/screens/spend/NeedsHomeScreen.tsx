import { useState } from 'react';
import { ArrowLeftRight, Ban } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SelectionBar from '@/components/SelectionBar';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useSelection } from '@/hooks/useSelection';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
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
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import {
  assignPurchases,
  PartlyAssignedError,
  returnPurchaseToWaiting,
  type PurchaseAssignment,
} from '@apps/runway/store/actions/purchaseActions';
import {
  selectAllCards,
  selectEnvelopes,
  selectItemLooks,
  selectIsNeedsHomeLoaded,
  selectNeedsHomeSections,
  type NeedsHomeMove,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpilledLines } from '@apps/runway/store/selectors/spillSelectors';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describePurchaseAssigned,
  describePurchaseKeptFree,
  describePurchaseReturned,
  getPairSideName,
} from '@apps/runway/utils/purchaseText';

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
  const isOnCard = (purchase.paidByCardId ?? null) !== null;
  const [isRefunding, setIsRefunding] = useState(false);

  if (isRefunding) {
    return (
      <PurchaseForm
        isOpen
        editing={purchase}
        onClose={onClose}
        onCancel={() => setIsRefunding(false)}
      />
    );
  }

  const cardChoices = (
    <ActionGroup isRoomy>
      <ActionRow
        isGrouped
        isRoomy
        icon={<ArrowLeftRight />}
        label={NEEDS_HOME_WORDS.refundRow}
        subtitle={NEEDS_HOME_WORDS.refundRowSub}
        onClick={() => setIsRefunding(true)}
      />
      <LeaveOutRow
        purchase={purchase}
        onDone={onClose}
        words={{
          label: NEEDS_HOME_WORDS.unseenRow,
          subtitle: NEEDS_HOME_WORDS.unseenRowSub,
        }}
      />
    </ActionGroup>
  );

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
        {purchase.status === 'posted' ? (
          <PairOffer
            purchase={purchase}
            onDone={onClose}
            elseSubtitle={isOnCard ? PAIR_WORDS.pickRefund : PAIR_WORDS.pickPay}
          >
            {isOnCard ? (
              cardChoices
            ) : (
              <DepositOffer deposit={purchase} onDone={onClose} />
            )}
          </PairOffer>
        ) : (
          isOnCard && cardChoices
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
  name = null,
  kind = null,
  tick,
  onOpen,
}: {
  purchase: OpenPurchase;
  sourceName: string;
  place?: string | null;
  /** The row's name when it is not the purchase's own (a move reads "Checking to Savings"). */
  name?: string | null;
  /** What the row is, in front of its date, in place of where it came from. */
  kind?: string | null;
  /** Select mode: the row ticks instead of opening. */
  tick?: { checked: boolean; onChange: (checked: boolean) => void };
  onOpen: () => void;
}) {
  const { isHidden } = useValuesHidden();
  const isIn = purchase.amountCents < 0;
  const title =
    name ??
    (purchase.label?.trim() ||
      purchase.merchant?.trim() ||
      (isIn ? NEEDS_HOME_WORDS.moneyIn : NEEDS_HOME_WORDS.untitled));
  const detail = (
    kind !== null
      ? [kind, formatDateOrdinalUTC(purchase.date)]
      : [
          formatDateOrdinalUTC(purchase.date),
          ...(purchase.status === 'pending' ? [NEEDS_HOME_WORDS.pending] : []),
          sourceName,
          ...(place === null ? [] : [place]),
        ]
  ).join(' · ');
  const amount = isIn
    ? `+${formatCents(-purchase.amountCents)}`
    : formatCents(purchase.amountCents);
  return (
    <ItemRow
      name={title}
      leading={<ItemBadge name={title} emoji={null} />}
      detail={detail}
      figure={amount}
      ariaLabel={`${isHidden ? title : `${title}, ${amount}`}, ${detail}${tick ? '' : '. Open'}`}
      tick={tick}
      onOpen={tick ? undefined : onOpen}
    />
  );
}

function EnvelopePickSheet({
  count,
  onPick,
  onClose,
}: {
  count: number;
  onPick: (envelopeId: string) => void;
  onClose: () => void;
}) {
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const looks = useAppSelector(selectItemLooks);
  const [query, setQuery] = useState('');
  const shown = envelopes.filter(({ item }) =>
    (looks.get(item.id)?.name ?? '')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <FormSheet isOpen isDrawerWhenShort onClose={onClose} title='Envelopes'>
      <div className='space-y-3 pb-4'>
        <div>
          <h3 className='text-2xl font-semibold'>
            {NEEDS_HOME_WORDS.bulkPickTitle}
          </h3>
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.bulkPickSub(count)}
          </p>
        </div>
        {envelopes.length >= RUNWAY_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={NEEDS_HOME_WORDS.bulkSearch}
          />
        )}
        {envelopes.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.bulkNoEnvelopes}
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.bulkNoMatch}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card max-h-[max(9rem,calc(92dvh-29rem))] divide-y overflow-y-auto rounded-2xl border'>
            {shown.map(({ item }) => {
              const name = looks.get(item.id)?.name ?? item.id;
              return (
                <ItemRow
                  key={item.id}
                  name={name}
                  emoji={looks.get(item.id)?.emoji ?? null}
                  isPrivate={false}
                  ariaLabel={name}
                  isAction
                  onOpen={() => onPick(item.id)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </FormSheet>
  );
}

/** Purchases that came in from a linked bank and wait for an envelope, quickest first: moves and card payments, money in, history that may be in twice, then the charges, which can be sorted several at a time. */
function NeedsHomeScreen({ onClose }: NeedsHomeScreenProps) {
  const today = todayAsUtcDate();
  const { moves, moneyIn, maybeTwice, charges } = useAppSelector((state) =>
    selectNeedsHomeSections(state, today),
  );
  const isLoaded = useAppSelector(selectIsNeedsHomeLoaded);
  const sourceNameOf = useSourceName();
  const looks = useAppSelector(selectItemLooks);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const cards = useAppSelector(selectAllCards);
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const selection = useSelection();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sent, setSent] = useState<OpenPurchase | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const opened =
    [
      ...moves.map((move) => move.purchase),
      ...charges,
      ...moneyIn,
      ...maybeTwice,
    ].find((entry) => entry.id === openId) ?? null;
  const isMoneyIn = opened !== null && opened.amountCents < 0;
  const cardNameOf = getCardNamer(cards);
  const selected = charges.filter((purchase) => selection.ids.has(purchase.id));
  const isAllTicked = charges.length > 0 && selected.length === charges.length;
  const isNothingTicked = selected.length === 0;

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
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
  const getMoveName = ({ purchase, others, isAmbiguous }: NeedsHomeMove) => {
    if (isAmbiguous) return null;
    const to = getPairSideName(others[0].purchase, accounts, cardNameOf);
    return others[0].kind === 'cardPayment'
      ? PAIR_WORDS.cardPaymentRow(to)
      : PAIR_WORDS.rowName(getPairSideName(purchase, accounts, cardNameOf), to);
  };

  const putBack = async (uid: string, written: readonly OpenPurchase[]) => {
    const encryption = await getRunwayEncryption(uid);
    const results = await written.reduce<Promise<boolean[]>>(
      async (previous, purchase) => {
        const done = await previous;
        const isBack = await returnPurchaseToWaiting(
          uid,
          encryption,
          purchase,
          describePurchaseReturned(purchase, nameOf),
          { ruleId: null, assignedBy: 'person' },
        ).then(
          () => true,
          () => false,
        );
        return [...done, isBack];
      },
      Promise.resolve([]),
    );
    const count = results.filter(Boolean).length;
    addToast({
      title:
        count === written.length
          ? NEEDS_HOME_WORDS.bulkUndone(count)
          : NEEDS_HOME_WORDS.bulkUndoPartly(count, written.length),
      type: count === written.length ? 'success' : 'warning',
    });
  };

  const runBulk = async (
    entries: PurchaseAssignment[],
    getTitle: (written: number, total: number) => string,
  ) => {
    if (!user || isWriting || entries.length === 0) return;
    const uid = user.uid;
    setIsWriting(true);
    const outcome = await getRunwayEncryption(uid)
      .then((encryption) => assignPurchases(uid, encryption, entries))
      .then(
        (written) => ({ written, error: null as unknown }),
        (error: unknown) =>
          error instanceof PartlyAssignedError
            ? { written: error.written, error: error.cause }
            : { written: [] as OpenPurchase[], error },
      );
    setIsWriting(false);
    if (outcome.written.length === 0) {
      addToast({
        title: NEEDS_HOME_WORDS.failed,
        description: getErrorMessage(outcome.error, ''),
        type: 'error',
      });
      return;
    }
    const { written } = outcome;
    addToast({
      title: getTitle(written.length, entries.length),
      description:
        outcome.error === null ? undefined : NEEDS_HOME_WORDS.bulkPartlyFailed,
      type: outcome.error === null ? 'success' : 'warning',
      action: {
        label: NEEDS_HOME_WORDS.undo,
        onClick: () =>
          void putBack(uid, written).catch((undoError: unknown) =>
            addToast({
              title: NEEDS_HOME_WORDS.undoFailed,
              description: getErrorMessage(undoError, ''),
              type: 'error',
            }),
          ),
      },
    });
    selection.exit();
  };

  const keepFree = () =>
    runBulk(
      selected.map((purchase) => ({
        purchase,
        lines: [
          {
            envelopeId: null,
            cents: purchase.amountCents,
            via: 'free' as const,
          },
        ],
        summary: describePurchaseKeptFree(purchase, () => ''),
      })),
      NEEDS_HOME_WORDS.bulkKept,
    );

  const putInEnvelope = (envelopeId: string) => {
    setIsPicking(false);
    const state = store.getState();
    const entries = selected.reduce<PurchaseAssignment[]>((done, purchase) => {
      const taken = done
        .flatMap((entry) => entry.lines)
        .map((line) => ({ ...line, cents: -line.cents }));
      const lines: PurchaseLine[] = getSpilledLines(
        state,
        [{ envelopeId, cents: purchase.amountCents, via: 'chosen' }],
        taken,
        purchase.date,
      );
      return [
        ...done,
        {
          purchase,
          lines,
          summary: describePurchaseAssigned(purchase, lines, nameOf),
        },
      ];
    }, []);
    void runBulk(entries, (written, total) =>
      NEEDS_HOME_WORDS.bulkPlaced(written, total, nameOf(envelopeId)),
    );
  };

  const leaveOut = async () => {
    const isConfirmed = await confirm({
      title: NEEDS_HOME_WORDS.bulkLeaveOutTitle(selected.length),
      message: NEEDS_HOME_WORDS.bulkLeaveOutMessage,
      confirmText: NEEDS_HOME_WORDS.bulkLeaveOutConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    await runBulk(
      selected.map((purchase) => ({
        purchase,
        lines: [],
        summary: describePurchaseAssigned(purchase, [], () => ''),
      })),
      NEEDS_HOME_WORDS.bulkLeft,
    );
  };

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

  const chargesTrailing = selection.isActive ? (
    <span className='flex items-center gap-1'>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        onClick={() => selection.toggle(charges.map((entry) => entry.id))}
      >
        {isAllTicked ? NEEDS_HOME_WORDS.clearAll : NEEDS_HOME_WORDS.selectAll}
      </Button>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        onClick={selection.exit}
      >
        {NEEDS_HOME_WORDS.cancelSelect}
      </Button>
    </span>
  ) : (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      onClick={selection.start}
    >
      {NEEDS_HOME_WORDS.select}
    </Button>
  );

  return (
    <Subview
      title={NEEDS_HOME_WORDS.title}
      onClose={onClose}
      onBack={selection.isActive ? selection.exit : undefined}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {!isLoaded ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.loading}
          </p>
        ) : moves.length +
            moneyIn.length +
            maybeTwice.length +
            charges.length ===
          0 ? (
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
            {moves.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={NEEDS_HOME_WORDS.movesHeading}
                  trailing={
                    <HelpTip title={NEEDS_HOME_WORDS.movesHeading}>
                      <p>{NEEDS_HOME_WORDS.movesHelp}</p>
                    </HelpTip>
                  }
                />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {moves.map((move) => (
                    <NeedsHomeRow
                      key={move.purchase.id}
                      purchase={move.purchase}
                      sourceName={sourceNameOf(move.purchase)}
                      name={getMoveName(move)}
                      kind={
                        move.others[0].kind === 'cardPayment'
                          ? NEEDS_HOME_WORDS.cardPaymentKind
                          : NEEDS_HOME_WORDS.moveKind
                      }
                      onOpen={() => setOpenId(move.purchase.id)}
                    />
                  ))}
                </ul>
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
            {charges.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={NEEDS_HOME_WORDS.chargesHeading}
                  trailing={chargesTrailing}
                />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {charges.map((purchase) => (
                    <NeedsHomeRow
                      key={purchase.id}
                      purchase={purchase}
                      sourceName={sourceNameOf(purchase)}
                      tick={
                        selection.isActive
                          ? {
                              checked: selection.ids.has(purchase.id),
                              onChange: () => selection.toggle([purchase.id]),
                            }
                          : undefined
                      }
                      onOpen={() => setOpenId(purchase.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {selection.isActive && (
        <SelectionBar
          note={
            isNothingTicked
              ? NEEDS_HOME_WORDS.nothingTicked
              : NEEDS_HOME_WORDS.selectedCount(selected.length)
          }
          actions={[
            {
              key: 'envelope',
              label: NEEDS_HOME_WORDS.bulkPut,
              shortLabel: NEEDS_HOME_WORDS.bulkPutShort,
              isDisabled: isNothingTicked || isWriting,
              onClick: () => setIsPicking(true),
            },
            {
              key: 'leave',
              label: NEEDS_HOME_WORDS.bulkLeaveOut,
              shortLabel: NEEDS_HOME_WORDS.bulkLeaveOutShort,
              icon: <Ban className='h-4 w-4' aria-hidden='true' />,
              isDisabled: isNothingTicked || isWriting,
              isDestructive: true,
              onClick: () => void leaveOut(),
            },
          ]}
          primary={{
            key: 'free',
            label: NEEDS_HOME_WORDS.bulkKeepFree,
            shortLabel: NEEDS_HOME_WORDS.bulkKeepFreeShort,
            isDisabled: isNothingTicked,
            isLoading: isWriting,
            onClick: () => void keepFree(),
          }}
        />
      )}
      {isPicking && (
        <EnvelopePickSheet
          count={selected.length}
          onPick={putInEnvelope}
          onClose={() => setIsPicking(false)}
        />
      )}
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
