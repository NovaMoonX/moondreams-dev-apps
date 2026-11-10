import { useMemo, useState } from 'react';

import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import FactRow from '@apps/helm/components/who/FactRow';
import FactSheet from '@apps/helm/components/who/FactSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface InferredFactsProps {
  onClose: () => void;
}

/** Everything the assistant inferred and the person has not confirmed, across people, pets, organizations and places, each row naming its subject. */
function InferredFacts({ onClose }: InferredFactsProps) {
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const facts = useAppSelector((state) => state.helm.facts.items);
  const who = useAppSelector((state) => state.helm.who.items);
  const places = useAppSelector((state) => state.helm.places.items);
  const [openId, setOpenId] = useState<string | null>(null);
  const inferred = useMemo(() => {
    const known = new Set([...who, ...places].map((entry) => entry.id));
    return facts
      .filter(
        (fact) =>
          fact.status === 'inferred' &&
          [...fact.whoIds, ...fact.placeIds].some((id) => known.has(id)),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [facts, who, places]);
  const subjectOf = (subjectIds: string[]) => {
    const found = [...who, ...places].find(
      (entry) => subjectIds.includes(entry.id) && !entry.isUnreadable,
    );
    return found && !found.isUnreadable
      ? found.name
      : HELM_COPY.factSubjectGone;
  };

  return (
    <Subview overlay title={HELM_COPY.inferredTitle} onClose={onClose}>
      <div className='flex flex-col gap-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.inferredLead(assistant)}
        </p>
        {inferred.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {inferred.map((fact) => (
              <li key={fact.id}>
                <FactRow
                  fact={fact}
                  assistant={assistant}
                  now={now}
                  subject={subjectOf(fact.subjectIds)}
                  onOpen={setOpenId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <FactSheet
        key={openId ?? 'none'}
        factId={openId}
        onClose={() => setOpenId(null)}
      />
    </Subview>
  );
}

export default InferredFacts;
