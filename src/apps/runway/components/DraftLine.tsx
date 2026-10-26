import { useState, type ReactNode } from 'react';
import { ArrowUpToLine, Hourglass, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { describeRange } from '@apps/runway/utils/rangeText';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import {
  DRAFT_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { HoldChoice, ItemKind } from '@apps/runway/types';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import {
  describeLineReason,
  describeTieBreak,
} from '@apps/runway/utils/draftText';

interface DraftLineProps {
  line: DraftLineData;
  name: string;
  emoji: string | null;
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
  /** Set where the day opens the line's sheet itself (a door from the footer). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** One line of a draft as a row: what it got and the one fact that matters most. It opens the line's sheet, with its reason, its choices and the item's changes. */
function DraftLine({
  line,
  name,
  emoji,
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
  isOpen: isOpenProp,
  onOpenChange,
}: DraftLineProps) {
  const [isOwnOpen, setIsOwnOpen] = useState(false);
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
    ? `${DRAFT_WORDS.shortBy} ${formatCentsShort(line.shortBy)}`
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
  const billShareShort = line.bill
    ? `${formatCentsShort(line.cents)} of ${formatCentsShort(line.bill.totalCents)} · due ${formatDateShortUTC(line.bill.dueOn)}`
    : null;
  const getDetail = () => {
    if (state === 'held')
      return {
        text:
          heldCents > 0
            ? ITEM_SHEET_R2_WORDS.heldDetail(formatCentsShort(heldCents))
            : `${formatCentsShort(line.shortBy)} short · choose`,
        isStrong: true,
      };
    if (shortText) return { text: shortText, isStrong: true };
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
    isDayOnly ? DRAFT_WORDS.dayOnly : null,
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
  const extra =
    choices.length > 0 || canUndo ? (
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

  return (
    <>
      <ItemRow
        name={name}
        emoji={emoji}
        detail={detail.text}
        isDetailStrong={detail.isStrong}
        figure={amount}
        ariaLabel={`${name}: ${PRIORITY_LABELS[line.tier]}, ${amount}. ${detail.text}`}
        onOpen={kind === null ? undefined : () => setIsOpen(true)}
      />
      {isOpen && kind !== null && (
        <ItemSheet
          itemId={line.itemId}
          kind={kind}
          today={today}
          figureLabel={ITEM_SHEET_WORDS.fromThisDay}
          figure={amount}
          fact={`${PRIORITY_LABELS[line.tier]} · ${pairingShort ?? billShareShort ?? reason}`}
          help={
            helpLines.length > 0 ? (
              <span className='block space-y-2'>
                {helpLines.map((text) => (
                  <span key={text} className='block'>
                    {text}
                  </span>
                ))}
              </span>
            ) : undefined
          }
          presetDayKey={dayKey}
          canChange={canChange}
          extra={extra}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default DraftLine;
