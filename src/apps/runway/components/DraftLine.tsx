import { useState, type ReactNode } from 'react';
import { ArrowUpToLine, Hourglass, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { formatCents } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import RangeNote from '@apps/runway/components/RangeNote';
import {
  DRAFT_WORDS,
  ITEM_SHEET_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { HoldChoice, ItemKind } from '@apps/runway/types';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import {
  describeBillShare,
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
}: DraftLineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const reason = describeLineReason(line, sourceNames, name, daySourceId);
  const tieNote = describeTieBreak(line);
  const billShare = describeBillShare(line);
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
    ? `${DRAFT_WORDS.shortBy} ${formatCents(line.shortBy)}`
    : null;
  const getDetail = () => {
    if (state === 'held')
      return { text: ITEM_SHEET_WORDS.heldFlag, isStrong: true };
    if (shortText) return { text: shortText, isStrong: true };
    return { text: billShare ?? reason, isStrong: false };
  };
  const detail = getDetail();
  const amount = formatCents(line.cents);
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
      <ActionGroup isRoomy caption={ITEM_SHEET_WORDS.lineHeading}>
        {choices.map(({ choice, label, subtitle, icon }) => (
          <ActionRow
            key={choice}
            isGrouped
            isRoomy
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
            isRoomy
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
          facts={[
            `${PRIORITY_LABELS[line.tier]}. ${reason}`,
            pairingNote ?? shortText ?? billShare,
            isDayOnly ? DRAFT_WORDS.dayOnly : tieNote,
          ]}
          note={
            line.bill?.ranged ? (
              <RangeNote
                range={line.bill.ranged.range}
                stance={line.bill.ranged.stance}
                side='expense'
                isOwnStance={line.bill.ranged.isOwnStance}
              />
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
