import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import FactKindGroup from '@apps/helm/components/howNomosSeesYou/FactKindGroup';
import WhereCard from '@apps/helm/components/where/WhereCard';
import KeyDatesList from '@apps/helm/components/who/KeyDatesList';
import MomentsPreview from '@apps/helm/components/who/MomentsPreview';
import StyleNotes from '@apps/helm/components/howNomosSeesYou/StyleNotes';
import SelfFactAddSheet from '@apps/helm/components/howNomosSeesYou/SelfFactAddSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import FactSheet from '@apps/helm/components/who/FactSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { selectSelfFacts } from '@apps/helm/store/selectors/factSelectors';
import type { OpenFact } from '@apps/helm/types';

interface HowNomosSeesYouProps {
  /** Where Back lands when it is not Home. */
  backLabel?: string;
  onBack: () => void;
  onHome: () => void;
}

const topicsOf = (facts: OpenFact[], kind: OpenFact['kind']) => [
  ...new Set(
    facts.flatMap((fact) =>
      fact.kind === kind && fact.topic ? [fact.topic] : [],
    ),
  ),
];

/** What the assistant believes about the person: who they are, their preferences and favorites, each opening its fact to confirm, correct or forget. */
function HowNomosSeesYou({
  backLabel = 'Home',
  onBack,
  onHome,
}: HowNomosSeesYouProps) {
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const facts = useAppSelector(selectSelfFacts);
  const selfWhoId = useAppSelector((state) => state.helm.profile?.selfWhoId);
  const isLoaded = useAppSelector((state) => state.helm.facts.isLoaded);
  const selfWho = useAppSelector((state) =>
    state.helm.who.items.find((entry) => entry.isSelf && !entry.isUnreadable),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const topicsByKind = useMemo(
    () => ({
      identity: topicsOf(facts, 'identity'),
      preference: topicsOf(facts, 'preference'),
      favorite: topicsOf(facts, 'favorite'),
    }),
    [facts],
  );
  const ofKind = (kind: OpenFact['kind']) =>
    facts.filter((fact) => fact.kind === kind);

  useScreenContext('howNomosSeesYou', null, [], {
    ask: HELM_COPY.askSeesYou,
    chip: HELM_COPY.chipSeesYou,
    back: HELM_COPY.backToSeesYou(assistant),
  });

  return (
    <>
      <HelmHeader backLabel={backLabel} onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <div className='flex items-start justify-between gap-3'>
          <h1 className='helm-serif min-w-0 text-[28px] leading-[34px] text-balance'>
            {HELM_COPY.seesYouTitle(assistant)}
          </h1>
          {selfWhoId && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative mt-1 shrink-0 whitespace-nowrap after:absolute after:-inset-y-1.5 after:content-['']"
              onClick={() => setIsAdding(true)}
            >
              {HELM_COPY.seesYouAdd}
            </Button>
          )}
        </div>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.seesYouLead(assistant)}
        </p>
        {isLoaded && facts.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.seesYouEmpty(assistant)}
          </p>
        )}
        <FactKindGroup
          label={HELM_COPY.seesYouIdentity}
          facts={ofKind('identity')}
          isGroupedByTopic={false}
          assistant={assistant}
          now={now}
          onOpen={setOpenId}
        />
        {selfWho && <WhereCard who={selfWho} />}
        {selfWho && <KeyDatesList who={selfWho} />}
        {selfWho && <MomentsPreview who={selfWho} />}
        <FactKindGroup
          label={HELM_COPY.seesYouPreferences}
          facts={ofKind('preference')}
          isGroupedByTopic
          assistant={assistant}
          now={now}
          onOpen={setOpenId}
        />
        <FactKindGroup
          label={HELM_COPY.seesYouFavorites}
          facts={ofKind('favorite')}
          isGroupedByTopic
          assistant={assistant}
          now={now}
          onOpen={setOpenId}
        />
        <StyleNotes />
      </main>
      <FactSheet
        key={openId ?? 'none'}
        factId={openId}
        onClose={() => setOpenId(null)}
      />
      {selfWhoId && (
        <SelfFactAddSheet
          isOpen={isAdding}
          onClose={() => setIsAdding(false)}
          selfWhoId={selfWhoId}
          topicsByKind={topicsByKind}
        />
      )}
    </>
  );
}

export default HowNomosSeesYou;
