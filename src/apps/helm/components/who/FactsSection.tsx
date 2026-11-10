import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import FactAddSheet from '@apps/helm/components/who/FactAddSheet';
import FactRow from '@apps/helm/components/who/FactRow';
import FactSheet from '@apps/helm/components/who/FactSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { FactSubject } from '@apps/helm/store/actions/memoryActions';

interface FactsSectionProps {
  subject: FactSubject;
  name: string;
}

/** What is kept about one who or place: confirmed and inferred facts, newest first, each opening its sheet, with "Add a fact" in the header. */
function FactsSection({ subject, name }: FactsSectionProps) {
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const allFacts = useAppSelector((state) => state.helm.facts.items);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const facts = useMemo(
    () =>
      allFacts
        .filter(
          (fact) =>
            fact.status !== 'superseded' &&
            fact.subjectIds.includes(subject.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [allFacts, subject.id],
  );

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={HELM_COPY.whoFactsTitle}
        trailing={
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='relative after:absolute after:-inset-x-1 after:-inset-y-2'
            onClick={() => setIsAdding(true)}
          >
            {HELM_COPY.factsAdd}
          </Button>
        }
      />
      {facts.length === 0 ? (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.whoFactsEmpty(assistant)}
        </p>
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {facts.map((fact) => (
            <li key={fact.id}>
              <FactRow
                fact={fact}
                assistant={assistant}
                now={now}
                onOpen={setOpenId}
              />
            </li>
          ))}
        </ul>
      )}
      <FactSheet factId={openId} onClose={() => setOpenId(null)} />
      <FactAddSheet
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        subject={subject}
        name={name}
      />
    </section>
  );
}

export default FactsSection;
