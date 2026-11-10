import SectionDivider from '@/components/SectionDivider';
import FactRow from '@apps/helm/components/who/FactRow';
import type { OpenFact } from '@apps/helm/types';

interface FactKindGroupProps {
  label: string;
  facts: OpenFact[];
  /** Splits the rows under a small muted topic label each, topics A to Z and the ones with none last. */
  isGroupedByTopic: boolean;
  assistant: string;
  now: number;
  onOpen: (factId: string) => void;
}

/** Inferred rows lead, then newest first. */
const toLeading = (facts: OpenFact[]) =>
  [...facts].sort(
    (a, b) =>
      Number(b.status === 'inferred') - Number(a.status === 'inferred') ||
      b.createdAt - a.createdAt,
  );

const toTopicGroups = (facts: OpenFact[]) => {
  const byTopic = toLeading(facts).reduce(
    (groups, fact) =>
      groups.set(fact.topic ?? '', [
        ...(groups.get(fact.topic ?? '') ?? []),
        fact,
      ]),
    new Map<string, OpenFact[]>(),
  );
  return [...byTopic.entries()]
    .map(([topic, rows]) => ({ topic, rows }))
    .sort(
      (a, b) =>
        Number(a.topic === '') - Number(b.topic === '') ||
        a.topic.localeCompare(b.topic),
    );
};

const toCapitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** One kind of fact about the person under its divider, each row opening the fact. */
function FactKindGroup({
  label,
  facts,
  isGroupedByTopic,
  assistant,
  now,
  onOpen,
}: FactKindGroupProps) {
  if (facts.length === 0) return null;
  const groups = isGroupedByTopic
    ? toTopicGroups(facts)
    : [{ topic: '', rows: toLeading(facts) }];

  return (
    <section className='space-y-3'>
      <SectionDivider label={label} />
      {groups.map((group) => (
        <div key={group.topic} className='space-y-1.5'>
          {group.topic !== '' && (
            <p className='text-muted-foreground px-4 text-[13px] break-words'>
              {toCapitalized(group.topic)}
            </p>
          )}
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {group.rows.map((fact) => (
              <li key={fact.id}>
                <FactRow
                  fact={fact}
                  assistant={assistant}
                  now={now}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default FactKindGroup;
