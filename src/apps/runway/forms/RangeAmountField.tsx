import { useState } from 'react';

import AmountField from '@/components/AmountField';
import { PillGroup } from '@/components/PillGroup';
import RangeNote from '@apps/runway/components/RangeNote';
import {
  FORM_FLOW_WORDS,
  RANGE_END_WORDS,
  STANCE_FOLLOW_PLAN,
  STANCE_LABELS,
  STANCES,
} from '@apps/runway/constants';
import {
  effectiveStance,
  getRangeEnd,
  type RangeSide,
} from '@apps/runway/engine/stance';
import type { Stance } from '@apps/runway/types';
import {
  getStanceOverride,
  parseAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';

const modeOptions = [
  {
    value: 'exact' as const,
    label: 'Exact',
    linkLabel: FORM_FLOW_WORDS.oneAmount,
  },
  {
    value: 'range' as const,
    label: 'A range',
    linkLabel: FORM_FLOW_WORDS.itVaries,
  },
];

interface RangeAmountFieldProps {
  label: string;
  hint: string;
  side: RangeSide;
  planStance: Stance;
  value: AmountDraft;
  onChange: (value: AmountDraft) => void;
  /** The amount as the form's large centred figure, "It varies" under it and the end it plans at one tap away. */
  isHero?: boolean;
  autoFocus?: boolean;
}

/** An exact amount or a range, and for a range which end this item plans at: the plan's stance unless it sets its own. */
function RangeAmountField({
  label,
  hint,
  side,
  planStance,
  value,
  onChange,
  isHero = false,
  autoFocus,
}: RangeAmountFieldProps) {
  const [isChoosingEnd, setIsChoosingEnd] = useState(false);
  const range = parseAmountDraft(value);
  const stance = effectiveStance(planStance, getStanceOverride(value));
  const stanceOptions = [
    {
      value: STANCE_FOLLOW_PLAN,
      label: `Follow the plan (${STANCE_LABELS[planStance]})`,
    },
    ...STANCES.map((entry) => ({
      value: entry,
      label: STANCE_LABELS[entry],
    })),
  ];
  const getHint = () => {
    if (value.mode === 'exact') return hint;
    if (range) {
      return (
        <RangeNote
          range={range}
          stance={stance}
          side={side}
          className='text-xs'
        />
      );
    }
    return `The plan uses ${RANGE_END_WORDS[getRangeEnd(stance, side)]} of a range.`;
  };

  const stancePills = (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>Plan it at</p>
      <PillGroup
        label='Plan it at'
        isThin
        options={stanceOptions}
        value={value.stance}
        onChange={(next) => onChange({ ...value, stance: next })}
      />
    </div>
  );

  if (isHero) {
    return (
      <div className='space-y-3'>
        <AmountField
          isHero
          autoFocus={autoFocus}
          label={label}
          modes={modeOptions}
          mode={value.mode}
          onModeChange={(mode) =>
            onChange({ ...value, mode: mode === 'range' ? 'range' : 'exact' })
          }
          value={value.low}
          onChange={(low) => onChange({ ...value, low })}
          highValue={value.high}
          onHighChange={(high) => onChange({ ...value, high })}
          hint={value.mode === 'exact' ? hint : getHint()}
          extraWays={
            value.mode === 'range' && !isChoosingEnd
              ? [
                  {
                    label: FORM_FLOW_WORDS.chooseEnd,
                    onClick: () => setIsChoosingEnd(true),
                  },
                ]
              : []
          }
        />
        {value.mode === 'range' && isChoosingEnd && stancePills}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <AmountField
        label={label}
        modes={modeOptions}
        mode={value.mode}
        onModeChange={(mode) =>
          onChange({ ...value, mode: mode === 'range' ? 'range' : 'exact' })
        }
        value={value.low}
        onChange={(low) => onChange({ ...value, low })}
        highValue={value.high}
        onHighChange={(high) => onChange({ ...value, high })}
        hint={getHint()}
      />
      {value.mode === 'range' && stancePills}
    </div>
  );
}

export default RangeAmountField;
