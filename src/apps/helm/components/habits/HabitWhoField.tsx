import { PillGroup, type PillOption } from '@/components/PillGroup';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';

interface HabitWhoFieldProps {
  /** The person it is for, or null for the person themselves. */
  value: string | null;
  onChange: (whoId: string | null) => void;
}

const YOU = '__you__';
const TIER_ORDER = { close: 0, regular: 1, passing: 2 } as const;

/** Who a medicine or care habit is for: "You" first, then the people Helm knows, closest first. */
function HabitWhoField({ value, onChange }: HabitWhoFieldProps) {
  const people = useAppSelector((state) => state.helm.who.items);
  const options: PillOption<string>[] = [
    { value: YOU, label: HELM_COPY.habitWhoYou },
    ...people
      .filter((who) => !who.isUnreadable && !who.isSelf)
      .sort(
        (left, right) =>
          TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
          left.name.localeCompare(right.name),
      )
      .map((who) => ({ value: who.id, label: who.name })),
  ];

  return (
    <PillGroup
      label={HELM_COPY.habitWhoLabel}
      options={options}
      value={value ?? YOU}
      onChange={(next) => onChange(next === YOU ? null : next)}
      isSearchable={options.length >= 8}
    />
  );
}

export default HabitWhoField;
