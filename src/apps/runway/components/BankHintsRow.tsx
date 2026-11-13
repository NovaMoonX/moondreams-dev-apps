import { Fragment, useState, type ReactNode } from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  AUTO_PAY_WORDS,
  BANK_HINTS_WORDS,
  BILLS_NOTICED_WORDS,
  CHARGED_TO_HINT_WORDS,
} from '@apps/runway/constants';
import AutoAmountSheet from '@apps/runway/components/AutoAmountSheet';
import { ChargePickerSheet } from '@apps/runway/components/ChargePickerView';
import ItemRow from '@apps/runway/components/ItemRow';
import RecurringPlaceSheet from '@apps/runway/components/RecurringPlaceSheet';
import RecurringStreamSheet from '@apps/runway/components/RecurringStreamSheet';
import type { AutoCheck } from '@apps/runway/engine/autoPay';
import { useAutoChecks } from '@apps/runway/hooks/useAutoPay';
import { useChargedToHints } from '@apps/runway/hooks/useChargedTo';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
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

const SHOWN_ROWS = 5;

interface BankHintGroup {
  id: string;
  heading: string;
  phrase: string;
  firstName: string;
  help: ReactNode;
  rows: ReactNode[];
}

interface OpenRecurring {
  key: string;
  kind: 'newBill' | 'place';
}

interface AutoCheckRowProps {
  check: AutoCheck;
  emoji: string | null;
}

function AutoCheckRow({ check, emoji }: AutoCheckRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const name =
    check.billName === '' ? AUTO_PAY_WORDS.fallbackBillName : check.billName;

  return (
    <>
      <ItemRow
        name={name}
        emoji={emoji}
        detail={
          check.kind === 'amount'
            ? AUTO_PAY_WORDS.chargedOn(formatDateOrdinalUTC(check.dueOn))
            : AUTO_PAY_WORDS.whichChargeSub(formatDateOrdinalUTC(check.dueOn))
        }
        ariaLabel={`${name}. ${
          check.kind === 'amount'
            ? AUTO_PAY_WORDS.enterAmount
            : AUTO_PAY_WORDS.whichCharge
        }`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen &&
        (check.kind === 'amount' ? (
          <AutoAmountSheet
            billId={check.billId}
            billName={name}
            dueOn={check.dueOn}
            onClose={() => setIsOpen(false)}
          />
        ) : (
          <ChargePickerSheet
            billId={check.billId}
            billName={name}
            dueOn={check.dueOn}
            onClose={() => setIsOpen(false)}
          />
        ))}
    </>
  );
}

const useBankHintGroups = (
  today: number,
  onOpenBill: (billId: string) => void,
  onOpenRecurring: (open: OpenRecurring) => void,
): BankHintGroup[] => {
  const { checks } = useAutoChecks();
  const hints = useChargedToHints(today);
  const bills = useAppSelector((state) => selectBills(state, today));
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const recurringHints = useRecurringHints(today);
  const emojiOf = useLiveEmojiResolver();
  const nameOf = getPlaceNamer(cards, accounts);
  const payloadOf = (billId: string) =>
    bills.find(({ item }) => item.id === billId)?.version.payload ?? null;

  const named = hints.flatMap((hint) => {
    const payload = payloadOf(hint.billId);
    return payload ? [{ hint, payload }] : [];
  });
  const elsewhere = named.map(({ hint, payload }) => (
    <ItemRow
      key={hint.billId}
      name={payload.name}
      emoji={emojiOf(payload.emoji, payload.groupId)}
      detail={CHARGED_TO_HINT_WORDS.rowLine(nameOf(hint.place))}
      ariaLabel={CHARGED_TO_HINT_WORDS.openAria(
        payload.name,
        nameOf(hint.place),
      )}
      isPrivate={false}
      onOpen={() => onOpenBill(hint.billId)}
    />
  ));
  const toCheck = checks.map((check) => {
    const payload = payloadOf(check.billId);
    return (
      <AutoCheckRow
        key={`${check.kind}-${check.billId}-${check.dueOn}`}
        check={check}
        emoji={payload ? emojiOf(payload.emoji, payload.groupId) : null}
      />
    );
  });

  const amounts = recurringHints.flatMap((hint) => {
    if (hint.kind !== 'amount') return [];
    const payload = payloadOf(hint.billId);
    return payload ? [{ hint, payload }] : [];
  });
  const amountRows = amounts.map(({ hint, payload }) => (
    <ItemRow
      key={hint.key}
      name={payload.name}
      emoji={emojiOf(payload.emoji, payload.groupId)}
      detail={
        hint.suggested.lowCents === hint.suggested.highCents
          ? BILLS_NOTICED_WORDS.amountLine(
              formatCents(hint.suggested.lowCents),
              formatRange(hint.current),
            )
          : BILLS_NOTICED_WORDS.amountRangeLine(
              formatCents(hint.suggested.lowCents),
              formatCents(hint.suggested.highCents),
              formatRange(hint.current),
            )
      }
      ariaLabel={BILLS_NOTICED_WORDS.amountAria(payload.name)}
      hiddenAriaLabel={BILLS_NOTICED_WORDS.amountHiddenAria(payload.name)}
      isPrivate
      onOpen={() => onOpenBill(hint.billId)}
    />
  ));

  const notInPlan = recurringHints.flatMap((hint) => {
    if (hint.kind === 'newBill') {
      const name = getStreamName(hint.stream);
      const line = BILLS_NOTICED_WORDS.newLine(
        formatCents(hint.amountCents),
        describeStreamHow(hint.stream),
        nameOf(hint.place),
      );
      return [
        {
          name,
          row: (
            <ItemRow
              key={hint.key}
              name={name}
              emoji={null}
              detail={line}
              ariaLabel={BILLS_NOTICED_WORDS.newAria(name, line)}
              hiddenAriaLabel={BILLS_NOTICED_WORDS.newHiddenAria(name)}
              isPrivate
              onOpen={() => onOpenRecurring({ key: hint.key, kind: 'newBill' })}
            />
          ),
        },
      ];
    }
    if (hint.kind !== 'place') return [];
    const name = BILLS_NOTICED_WORDS.placeName(
      cleanBankName(hint.providerAccount.name),
      hint.providerAccount.mask,
    );
    const line = BILLS_NOTICED_WORDS.placeLine(hint.streams.length);
    return [
      {
        name,
        row: (
          <ItemRow
            key={hint.key}
            name={name}
            emoji={null}
            detail={line}
            ariaLabel={BILLS_NOTICED_WORDS.placeAria(name, line)}
            isPrivate={false}
            onOpen={() => onOpenRecurring({ key: hint.key, kind: 'place' })}
          />
        ),
      },
    ];
  });

  const groups: BankHintGroup[] = [
    {
      id: 'toCheck',
      heading: BANK_HINTS_WORDS.toCheckHeading,
      phrase: BANK_HINTS_WORDS.toCheckPhrase,
      firstName:
        checks.length > 0
          ? checks[0].billName || AUTO_PAY_WORDS.fallbackBillName
          : (amounts[0]?.payload.name ?? ''),
      help: null,
      rows: [...toCheck, ...amountRows],
    },
    {
      id: 'chargedElsewhere',
      heading: BANK_HINTS_WORDS.chargedElsewhereHeading,
      phrase: BANK_HINTS_WORDS.chargedElsewherePhrase,
      firstName: named[0]?.payload.name ?? '',
      help: (
        <HelpTip title={BANK_HINTS_WORDS.chargedElsewhereHelpTitle}>
          <p>{CHARGED_TO_HINT_WORDS.headingHelp}</p>
        </HelpTip>
      ),
      rows: elsewhere,
    },
    {
      id: 'notInPlan',
      heading: BANK_HINTS_WORDS.notInPlanHeading,
      phrase: BANK_HINTS_WORDS.notInPlanPhrase,
      firstName: notInPlan[0]?.name ?? '',
      help: (
        <HelpTip title={BANK_HINTS_WORDS.notInPlanHelpTitle}>
          <p>{BANK_HINTS_WORDS.notInPlanHelp}</p>
        </HelpTip>
      ),
      rows: notInPlan.map(({ row }) => row),
    },
  ];
  return groups.filter(({ rows }) => rows.length > 0);
};

interface BankHintsRowProps {
  today: number;
  onOpenBill: (billId: string) => void;
}

function BankHintsRow({ today, onOpenBill }: BankHintsRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unfolded, setUnfolded] = useState<string[]>([]);
  const [open, setOpen] = useState<OpenRecurring | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const recurringHints = useRecurringHints(today);
  const openHint =
    recurringHints.find(
      (hint) => hint.key === open?.key && hint.kind === open.kind,
    ) ?? null;
  const closeHint = () => {
    setOpen(null);
    setIsFormOpen(false);
  };
  const groups = useBankHintGroups(
    today,
    (billId) => {
      setIsOpen(false);
      onOpenBill(billId);
    },
    (next) => {
      setIsOpen(false);
      setOpen(next);
    },
  );
  if (groups.length === 0 && !isFormOpen) return null;

  return (
    <>
      {groups.length > 0 && (
        <Button
          type='button'
          variant='tertiary'
          className='bg-card border-border hover:bg-muted/60 h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-1.5 text-left font-normal whitespace-normal'
          onClick={() => setIsOpen(true)}
        >
          <Lightbulb
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <span className='text-muted-foreground min-w-0 flex-1 text-sm text-balance break-words'>
            {BANK_HINTS_WORDS.line(
              groups[0].firstName,
              groups[0].phrase,
              groups.reduce((sum, { rows }) => sum + rows.length, 0) - 1,
            )}
          </span>
          <ChevronRight
            className='text-muted-foreground h-4 w-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      )}
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={BANK_HINTS_WORDS.title}
      >
        <div className='space-y-4'>
          {groups.map(({ id, heading, help, rows }) => {
            const hidden = rows.length - SHOWN_ROWS;
            const isUnfolded = unfolded.includes(id);
            return (
              <Fragment key={id}>
                <SectionDivider label={heading} trailing={help} />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {hidden > 0 && !isUnfolded ? rows.slice(0, SHOWN_ROWS) : rows}
                </ul>
                {hidden > 0 && (
                  <ShowMoreButton
                    isOpen={isUnfolded}
                    onClick={() =>
                      setUnfolded((current) =>
                        isUnfolded
                          ? current.filter((value) => value !== id)
                          : [...current, id],
                      )
                    }
                  >
                    {isUnfolded
                      ? BANK_HINTS_WORDS.showFewer
                      : BANK_HINTS_WORDS.showMore(hidden)}
                  </ShowMoreButton>
                )}
              </Fragment>
            );
          })}
        </div>
      </DetailSheet>
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
    </>
  );
}

export default BankHintsRow;
