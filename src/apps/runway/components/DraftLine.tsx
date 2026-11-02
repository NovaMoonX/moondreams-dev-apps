import { useState, type ReactNode } from 'react';
import { ArrowUpToLine, Hourglass, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { describeRange } from '@apps/runway/utils/rangeText';
import ItemRow from '@apps/runway/components/ItemRow';
import BillShareView from '@apps/runway/components/BillShareView';
import ItemSheet, {
  type ItemSheetProps,
} from '@apps/runway/components/ItemSheet';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CHECKLIST_R3_WORDS,
  DRAFT_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  NEEDS_LOOK_WORDS,
  PAY_SHARE_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { usePaidFromAction } from '@apps/runway/hooks/usePaidFromAction';
import { useRecordedEmoji } from '@apps/runway/hooks/useItemEmoji';
import type { HoldChoice, ItemKind } from '@apps/runway/types';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import {
  describeLineReason,
  describeTieBreak,
} from '@apps/runway/utils/draftText';

interface DraftLineProps {
  line: DraftLineData;
  name: string;
  /** The item's kind; a line whose item is gone has none and opens nothing. */
  kind: ItemKind | null;
  sourceNames: Record<string, string>;
  /** The source that pays the whole day, so a line need not repeat it. */
  daySourceId?: string | null;
  today: number;
  dayKey: string;
  /** Answers a short pairing; absent where the line cannot be answered. */
  onChoose?: (line: DraftLineData, choice: HoldChoice) => void;
  isChoosing?: boolean;
  /** Takes back the choice made for a held line; absent where the line cannot be answered. */
  onUndoChoice?: (line: DraftLineData) => void;
  /** The item can be changed from this income day or for this day alone. */
  canChange?: boolean;
  /** This income day takes its own version of the line. */
  isDayOnly?: boolean;
  /** Takes back a bill's changed share for this day; absent where the day cannot change. */
  onResetShare?: (line: DraftLineData) => void;
  /** The shortfall is one of the plan's things to fix, so it wears the warning; any other short line stays neutral. */
  isWarning?: boolean;
  /** Set where the day opens the line's sheet itself (a door from the footer). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** One line of a draft as a row: what it got and the one fact that matters most. It opens the line's sheet, with its reason, its choices and the item's changes. */
function DraftLine({
  line,
  name,
  kind,
  sourceNames,
  daySourceId,
  today,
  dayKey,
  onChoose,
  onUndoChoice,
  isChoosing = false,
  canChange = false,
  isDayOnly = false,
  onResetShare,
  isWarning = false,
  isOpen: isOpenProp,
  onOpenChange,
}: DraftLineProps) {
  const [isOwnOpen, setIsOwnOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const emoji = useRecordedEmoji(null, line.itemId);
  const isOpen = isOpenProp ?? isOwnOpen;
  const setIsOpen = onOpenChange ?? setIsOwnOpen;
  const reason = describeLineReason(line, sourceNames, name, daySourceId);
  const tieNote = describeTieBreak(line);
  const isShort = line.shortBy > 0;
  const state = line.pairing?.state ?? null;
  const source =
    line.sourceId !== null && Object.hasOwn(sourceNames, line.sourceId)
      ? sourceNames[line.sourceId]
      : DRAFT_WORDS.unnamedSource;
  const shortSentence = `${name} is ${formatCents(line.shortBy)} short from ${source}.`;
  const getPairingNote = () => {
    if (state === 'held') {
      const held = line.pairing?.heldCents ?? 0;
      return held > 0
        ? `${shortSentence} ${formatCents(held)} is held until you choose.`
        : `${shortSentence} It stays short until you choose.`;
    }
    if (state === 'offered') return shortSentence;
    if (state === 'leftShort')
      return `${DRAFT_WORDS.leftShort}. ${shortSentence}`;
    if (state === 'toppedUp' && isShort)
      return `${DRAFT_WORDS.toppedUp}. ${name} is still ${formatCents(line.shortBy)} short.`;
    if (state === 'toppedUp') return DRAFT_WORDS.toppedUp;
    return null;
  };
  const pairingNote = getPairingNote();
  const shortText = isShort
    ? CHECKLIST_R3_WORDS.short(formatCentsShort(line.shortBy))
    : null;
  const heldCents = line.pairing?.heldCents ?? 0;
  const getPairingShort = () => {
    if (state === 'held')
      return heldCents > 0
        ? `${formatCentsShort(heldCents)} held · ${formatCentsShort(line.shortBy)} short`
        : `${formatCentsShort(line.shortBy)} short`;
    if (state === 'offered') return `${formatCentsShort(line.shortBy)} short`;
    if (state === 'leftShort')
      return `${DRAFT_WORDS.leftShort} · ${formatCentsShort(line.shortBy)} short`;
    if (state === 'toppedUp')
      return isShort
        ? `${ITEM_SHEET_R2_WORDS.toppedUp} · still ${formatCentsShort(line.shortBy)} short`
        : ITEM_SHEET_R2_WORDS.toppedUp;
    return null;
  };
  const pairingShort = getPairingShort();
  const getBillShareShort = () => {
    if (!line.bill) return null;
    const { setAsideCents = 0, totalCents, dueOn } = line.bill;
    const due = formatDateShortUTC(dueOn);
    if (setAsideCents >= totalCents)
      return PAY_SHARE_WORDS.restSetAside(formatCentsShort(line.cents), due);
    if (setAsideCents > 0 && line.cents + setAsideCents >= totalCents)
      return PAY_SHARE_WORDS.completesIt(formatCentsShort(line.cents), due);
    return `${formatCentsShort(line.cents)} of ${formatCentsShort(totalCents)} · due ${due}`;
  };
  const billShareShort = getBillShareShort();
  const getDetail = () => {
    if (isHidden && (state === 'held' || shortText))
      return { text: NEEDS_LOOK_WORDS.short, isStrong: false };
    if (state === 'held')
      return {
        text:
          heldCents > 0
            ? ITEM_SHEET_R2_WORDS.heldDetail(formatCentsShort(heldCents))
            : CHECKLIST_R3_WORDS.shortChoose(formatCentsShort(line.shortBy)),
        isStrong: true,
      };
    if (shortText) return { text: shortText, isStrong: isWarning };
    if (isDayOnly && line.bill)
      return { text: PAY_SHARE_WORDS.changedFor, isStrong: false };
    return { text: billShareShort ?? reason, isStrong: false };
  };
  const detail = getDetail();
  const amount = formatCents(line.cents);
  const helpLines = [
    pairingShort || billShareShort ? reason : null,
    pairingNote,
    line.bill?.ranged
      ? describeRange(
          line.bill.ranged.range,
          line.bill.ranged.stance,
          'expense',
          line.bill.ranged.isOwnStance,
        )
      : null,
    isDayOnly && line.bill ? PAY_SHARE_WORDS.changedFor : null,
    isDayOnly && !line.bill ? DRAFT_WORDS.dayOnly : null,
    tieNote,
  ].filter((text): text is string => Boolean(text));
  const canChoose = Boolean(onChoose);
  const choices: {
    choice: HoldChoice;
    label: string;
    subtitle: string;
    icon: ReactNode;
  }[] = !canChoose
    ? []
    : state === 'held'
      ? [
          {
            choice: 'topUp',
            label: DRAFT_WORDS.topUp,
            subtitle: ITEM_SHEET_WORDS.topUpSub,
            icon: <ArrowUpToLine />,
          },
          {
            choice: 'leaveShort',
            label: DRAFT_WORDS.leaveShort,
            subtitle: ITEM_SHEET_WORDS.leaveShortSub,
            icon: <Hourglass />,
          },
        ]
      : state === 'offered' || state === 'leftShort'
        ? [
            {
              choice: 'topUp',
              label: DRAFT_WORDS.topUp,
              subtitle: ITEM_SHEET_WORDS.topUpSub,
              icon: <ArrowUpToLine />,
            },
          ]
        : [];
  const canUndo =
    Boolean(onUndoChoice) && (state === 'toppedUp' || state === 'leftShort');
  const canResetShare =
    Boolean(onResetShare) && isDayOnly && line.bill !== null;
  const extra =
    choices.length > 0 || canUndo || canResetShare ? (
      <ActionGroup caption={ITEM_SHEET_WORDS.lineHeading}>
        {choices.map(({ choice, label, subtitle, icon }) => (
          <ActionRow
            key={choice}
            isGrouped
            icon={icon}
            label={label}
            subtitle={subtitle}
            isDisabled={isChoosing}
            onClick={() => onChoose?.(line, choice)}
          />
        ))}
        {canResetShare && (
          <ActionRow
            isGrouped
            icon={<Undo2 />}
            label={PAY_SHARE_WORDS.backToPlan}
            subtitle={PAY_SHARE_WORDS.backToPlanSub}
            isDisabled={isChoosing}
            onClick={() => onResetShare?.(line)}
          />
        )}
        {canUndo && (
          <ActionRow
            isGrouped
            icon={<Undo2 />}
            label={DRAFT_WORDS.undoChoice}
            subtitle={ITEM_SHEET_WORDS.undoChoiceSub}
            isDisabled={isChoosing}
            onClick={() => onUndoChoice?.(line)}
          />
        )}
      </ActionGroup>
    ) : null;

  const sheetProps: ItemSheetProps | null =
    kind === null
      ? null
      : {
          itemId: line.itemId,
          kind,
          today,
          figureLabel: ITEM_SHEET_WORDS.fromThisDay,
          figure: amount,
          fact: `${PRIORITY_LABELS[line.tier]} · ${isHidden && (pairingShort || shortText) ? NEEDS_LOOK_WORDS.short : (pairingShort ?? billShareShort ?? reason)}`,
          help:
            helpLines.length > 0 ? (
              <span className='block space-y-2'>
                {helpLines.map((text) => (
                  <span key={text} className='block'>
                    <MaskedText>{text}</MaskedText>
                  </span>
                ))}
              </span>
            ) : undefined,
          presetDayKey: dayKey,
          quickChange:
            kind === 'bill' || kind === 'envelope' || kind === 'goal'
              ? { label: ITEM_SHEET_R2_WORDS.changeAmount, step: 'amount' }
              : undefined,
          canChange,
          extra,
          onClose: () => setIsOpen(false),
        };

  return (
    <>
      <ItemRow
        name={name}
        emoji={emoji}
        detail={detail.text}
        isDetailStrong={detail.isStrong && !isHidden}
        isDetailWarning={isShort && state !== 'held' && !isHidden}
        figure={amount}
        ariaLabel={`${name}: ${PRIORITY_LABELS[line.tier]}, ${amount}. ${detail.text}`}
        onOpen={kind === null ? undefined : () => setIsOpen(true)}
      />
      {isOpen && sheetProps !== null && kind === 'bill' && (
        <BillLineSheet
          line={line}
          name={name}
          dayKey={dayKey}
          sheetProps={sheetProps}
        />
      )}
      {isOpen && sheetProps !== null && kind !== 'bill' && (
        <ItemSheet {...sheetProps} />
      )}
    </>
  );
}

interface BillLineSheetProps {
  line: DraftLineData;
  name: string;
  dayKey: string;
  sheetProps: ItemSheetProps;
}

/** A bill's sheet from an income day: its Paid from row, and a change to what this one pay puts in (not on a pay that pays it first, where the figure comes from the pairing). */
function BillLineSheet({ line, name, dayKey, sheetProps }: BillLineSheetProps) {
  const paidFromAction = usePaidFromAction(line.itemId, sheetProps.today);
  const mask = useMaskedText();
  return (
    <ItemSheet
      {...sheetProps}
      maxAction={paidFromAction}
      dayAction={
        line.bill
          ? {
              label: PAY_SHARE_WORDS.action,
              subtitle: mask(
                PAY_SHARE_WORDS.actionSub(
                  name,
                  formatCents(line.bill.totalCents),
                ),
              ),
              renderView: ({ onBack, onClose, openChange }) => (
                <BillShareView
                  billId={line.itemId}
                  dayKey={dayKey}
                  currentCents={line.demandCents}
                  onBack={onBack}
                  onClose={onClose}
                  onOpenPaidFrom={() => openChange('funding')}
                />
              ),
            }
          : undefined
      }
    />
  );
}

export default DraftLine;
