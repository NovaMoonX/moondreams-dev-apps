import { useState } from 'react';

import HelpTip from '@/components/HelpTip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { BILLS_NOTICED_WORDS } from '@apps/runway/constants';
import ItemRow from '@apps/runway/components/ItemRow';
import LevelGate from '@apps/runway/components/LevelGate';
import RecurringPlaceSheet from '@apps/runway/components/RecurringPlaceSheet';
import RecurringStreamSheet from '@apps/runway/components/RecurringStreamSheet';
import type { RecurringHint } from '@apps/runway/engine/recurring';
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
  const [isUnfolded, setIsUnfolded] = useState(false);
  const [openHint, setOpenHint] = useState<Extract<
    RecurringHint,
    { kind: 'newBill' | 'place' }
  > | null>(null);

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
      if (!payload) return [];
      return [
        {
          key: hint.key,
          name: payload.name,
          emoji: emojiOf(payload.emoji, payload.groupId),
          detail: BILLS_NOTICED_WORDS.amountLine(
            formatRange(hint.suggested),
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
          onOpen: () => setOpenHint(hint),
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
        onOpen: () => setOpenHint(hint),
      },
    ];
  });

  const rows = [...chargedRows, ...recurringRows];
  if (rows.length === 0 && openHint === null) return null;

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
      {openHint?.kind === 'newBill' && (
        <RecurringStreamSheet
          hint={openHint}
          onClose={() => setOpenHint(null)}
        />
      )}
      {openHint?.kind === 'place' && (
        <RecurringPlaceSheet
          hint={openHint}
          onClose={() => setOpenHint(null)}
        />
      )}
    </LevelGate>
  );
}

export default BillsNoticedCard;
