import { useState } from 'react';

import HelpTip from '@/components/HelpTip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { BILLS_NOTICED_WORDS } from '@apps/runway/constants';
import ItemRow from '@apps/runway/components/ItemRow';
import LevelGate from '@apps/runway/components/LevelGate';
import RecurringPlaceSheet from '@apps/runway/components/RecurringPlaceSheet';
import RecurringStreamSheet from '@apps/runway/components/RecurringStreamSheet';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useChargedToHints } from '@apps/runway/hooks/useChargedTo';
import { useRecurringHints } from '@apps/runway/hooks/useRecurring';
import {
  selectAllAccounts,
  selectAllCards,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import { cleanBankName } from '@apps/runway/utils/accountText';
import { getPlaceNamer } from '@apps/runway/utils/chargedToText';
import { formatRange } from '@apps/runway/utils/rangeText';
import {
  describeStreamHow,
  getStreamName,
} from '@apps/runway/utils/recurringText';

const SHOWN_ROWS = 3;

interface BillsNoticedCardProps {
  today: number;
  onOpenBill: (billId: string) => void;
}

interface NoticedRow {
  key: string;
  name: string;
  emoji: string | null;
  detail: string;
  ariaLabel: string;
  hiddenAriaLabel?: string;
  isPrivate: boolean;
  onOpen: () => void;
}

/** Everything the app noticed about the person's bills: charges on a card or account other than the one a bill names, the bank's repeating charges that differ from a bill's amount or are not a bill yet, and accounts with repeating charges that are not in the plan. A glance row each; a row opens where the suggestion is answered. */
function BillsNoticedCard({ today, onOpenBill }: BillsNoticedCardProps) {
  const chargedHints = useChargedToHints(today);
  const recurringHints = useRecurringHints(today);
  const bills = useAppSelector((state) => selectBills(state, today));
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const emojiOf = useLiveEmojiResolver();
  const { isHidden } = useValuesHidden();
  const [isUnfolded, setIsUnfolded] = useState(false);
  const [open, setOpen] = useState<{
    key: string;
    kind: 'newBill' | 'place';
  } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const openHint =
    recurringHints.find(
      (hint) => hint.key === open?.key && hint.kind === open.kind,
    ) ?? null;
  const closeHint = () => {
    setOpen(null);
    setIsFormOpen(false);
  };

  const nameOf = getPlaceNamer(cards, accounts);
  const payloadOf = (billId: string) =>
    bills.find(({ item }) => item.id === billId)?.version.payload ?? null;

  const chargedRows = chargedHints.flatMap((hint): NoticedRow[] => {
    const payload = payloadOf(hint.billId);
    const place = nameOf(hint.place);
    return payload
      ? [
          {
            key: `charged:${hint.billId}`,
            name: payload.name,
            emoji: emojiOf(payload.emoji, payload.groupId),
            detail: BILLS_NOTICED_WORDS.chargedLine(place),
            ariaLabel: BILLS_NOTICED_WORDS.chargedAria(payload.name, place),
            isPrivate: false,
            onOpen: () => onOpenBill(hint.billId),
          },
        ]
      : [];
  });

  const recurringRows = recurringHints.flatMap((hint): NoticedRow[] => {
    if (hint.kind === 'amount') {
      const payload = payloadOf(hint.billId);
      if (!payload || isHidden) return [];
      return [
        {
          key: hint.key,
          name: payload.name,
          emoji: emojiOf(payload.emoji, payload.groupId),
          detail:
            hint.suggested.lowCents === hint.suggested.highCents
              ? BILLS_NOTICED_WORDS.amountLine(
                  formatCents(hint.suggested.lowCents),
                  formatRange(hint.current),
                )
              : BILLS_NOTICED_WORDS.amountRangeLine(
                  formatCents(hint.suggested.lowCents),
                  formatCents(hint.suggested.highCents),
                  formatRange(hint.current),
                ),
          ariaLabel: BILLS_NOTICED_WORDS.amountAria(payload.name),
          hiddenAriaLabel: BILLS_NOTICED_WORDS.amountHiddenAria(payload.name),
          isPrivate: true,
          onOpen: () => onOpenBill(hint.billId),
        },
      ];
    }
    if (hint.kind === 'newBill') {
      const name = getStreamName(hint.stream);
      const line = BILLS_NOTICED_WORDS.newLine(
        formatCents(hint.amountCents),
        describeStreamHow(hint.stream),
        nameOf(hint.place),
      );
      return [
        {
          key: hint.key,
          name,
          emoji: null,
          detail: line,
          ariaLabel: BILLS_NOTICED_WORDS.newAria(name, line),
          hiddenAriaLabel: BILLS_NOTICED_WORDS.newHiddenAria(name),
          isPrivate: true,
          onOpen: () => setOpen({ key: hint.key, kind: 'newBill' }),
        },
      ];
    }
    const name = BILLS_NOTICED_WORDS.placeName(
      cleanBankName(hint.providerAccount.name),
      hint.providerAccount.mask,
    );
    const line = BILLS_NOTICED_WORDS.placeLine(hint.streams.length);
    return [
      {
        key: hint.key,
        name,
        emoji: null,
        detail: line,
        ariaLabel: BILLS_NOTICED_WORDS.placeAria(name, line),
        isPrivate: false,
        onOpen: () => setOpen({ key: hint.key, kind: 'place' }),
      },
    ];
  });

  const rows = [...chargedRows, ...recurringRows];
  if (rows.length === 0 && !isFormOpen) return null;

  const hidden = rows.length - SHOWN_ROWS;
  const shown = hidden > 0 && !isUnfolded ? rows.slice(0, SHOWN_ROWS) : rows;

  return (
    <LevelGate level='link'>
      <section className='space-y-2'>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <h3 className='min-w-0 text-sm font-semibold'>
            {BILLS_NOTICED_WORDS.heading}
            <span className='text-muted-foreground font-normal'>
              {' · '}
              {rows.length}
            </span>
          </h3>
          <HelpTip title={BILLS_NOTICED_WORDS.heading}>
            <p>{BILLS_NOTICED_WORDS.headingHelp}</p>
          </HelpTip>
        </div>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map((row) => (
            <ItemRow
              key={row.key}
              name={row.name}
              emoji={row.emoji}
              detail={row.detail}
              ariaLabel={row.ariaLabel}
              hiddenAriaLabel={row.hiddenAriaLabel}
              isPrivate={row.isPrivate}
              onOpen={row.onOpen}
            />
          ))}
        </ul>
        {hidden > 0 && (
          <ShowMoreButton
            isOpen={isUnfolded}
            onClick={() => setIsUnfolded((current) => !current)}
          >
            {isUnfolded
              ? BILLS_NOTICED_WORDS.fewer
              : BILLS_NOTICED_WORDS.more(hidden)}
          </ShowMoreButton>
        )}
      </section>
      {open?.kind === 'newBill' && (openHint || isFormOpen) && (
        <RecurringStreamSheet
          hint={openHint?.kind === 'newBill' ? openHint : null}
          onFormChange={setIsFormOpen}
          onClose={closeHint}
        />
      )}
      {open?.kind === 'place' && (openHint || isFormOpen) && (
        <RecurringPlaceSheet
          hint={openHint?.kind === 'place' ? openHint : null}
          onFormChange={setIsFormOpen}
          onClose={closeHint}
        />
      )}
    </LevelGate>
  );
}

export default BillsNoticedCard;
