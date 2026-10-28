import { useState } from 'react';

import { MultiPillGroup } from '@/components/PillGroup';
import BackLink from '@/components/BackLink';
import RevealChip from '@/components/RevealChip';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  LineAmountList,
  LineAmountView,
} from '@apps/runway/components/LineAmounts';
import { SPEND_WORDS } from '@apps/runway/constants';
import { getLineEffect } from '@apps/runway/engine/purchases';
import { MaskedText } from '@apps/runway/components/MaskedText';

export interface SplitEnvelope {
  id: string;
  name: string;
  emoji: string | null;
  leftCents: number;
}

interface SplitEditorProps {
  totalCents: number;
  envelopes: readonly SplitEnvelope[];
  ids: readonly string[];
  shares: Readonly<Record<string, string>>;
  onIdsChange: (ids: string[]) => void;
  onShareChange: (id: string, text: string) => void;
  onEvenly: () => void;
  onBack: () => void;
  isSaving: boolean;
}

/** Shares one amount between several envelopes. The shares must add up to the amount to the cent before the sheet goes back to the form. */
function SplitEditor({
  totalCents,
  envelopes,
  ids,
  shares,
  onIdsChange,
  onShareChange,
  onEvenly,
  onBack,
  isSaving,
}: SplitEditorProps) {
  const chosen = envelopes.filter((envelope) => ids.includes(envelope.id));
  const assigned = chosen.reduce(
    (sum, envelope) =>
      sum + (parseMoneyToCents(shares[envelope.id] ?? '') ?? 0),
    0,
  );
  const rest = totalCents - assigned;
  const getRestLine = () => {
    if (chosen.length < 2) return null;
    if (rest === 0) return `All ${formatCents(totalCents)} is placed.`;
    return rest > 0
      ? `${formatCents(rest)} of ${formatCents(totalCents)} is still to place.`
      : `${formatCents(-rest)} more than ${formatCents(totalCents)}.`;
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = chosen.find((envelope) => envelope.id === editingId) ?? null;

  if (editing) {
    return (
      <LineAmountView
        name={editing.name}
        value={shares[editing.id] ?? ''}
        onChange={(text) => onShareChange(editing.id, text)}
        onBack={() => setEditingId(null)}
        plannedCents={null}
        isDisabled={isSaving}
        hasOwnFooter
      />
    );
  }

  return (
    <div className='space-y-3'>
      <BackLink onBack={onBack} />
      <p className='text-muted-foreground text-sm'>{SPEND_WORDS.splitIntro}</p>
      <MultiPillGroup
        label={SPEND_WORDS.envelope}
        options={envelopes.map((envelope) => ({
          value: envelope.id,
          label: envelope.name,
          emoji: envelope.emoji ?? undefined,
        }))}
        values={ids}
        onChange={onIdsChange}
      />
      <div className='flex flex-wrap items-center gap-2'>
        {chosen.length >= 2 && (
          <RevealChip onClick={onEvenly}>{SPEND_WORDS.splitEvenly}</RevealChip>
        )}
        {getRestLine() && (
          <p className='text-muted-foreground text-sm' role='status'>
            <MaskedText>{getRestLine() ?? ''}</MaskedText>
          </p>
        )}
      </div>
      {chosen.length > 0 && (
        <LineAmountList
          onOpen={setEditingId}
          items={chosen.map((envelope) => {
            const cents = parseMoneyToCents(shares[envelope.id] ?? '');
            const over =
              cents === null
                ? 0
                : getLineEffect(envelope.leftCents, cents).overCents;
            return {
              id: envelope.id,
              name: envelope.name,
              emoji: envelope.emoji,
              cents,
              detail: over > 0 ? `${formatCents(over)} over` : null,
            };
          })}
        />
      )}
    </div>
  );
}

export default SplitEditor;
