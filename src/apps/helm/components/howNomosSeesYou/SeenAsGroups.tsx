import SectionHeader from '@/components/SectionHeader';
import SeenAsRow from '@apps/helm/components/howNomosSeesYou/SeenAsRow';
import SeenAsSheet from '@apps/helm/components/howNomosSeesYou/SeenAsSheet';
import { SEEN_AS_WORDS } from '@apps/helm/components/howNomosSeesYou/seenAsWords';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAppSelector } from '@/store';
import { selectIsLearningOn } from '@apps/helm/store/selectors/patternSelectors';
import { selectSeenAsGroups } from '@apps/helm/store/selectors/seenAsSelectors';
import { useState } from 'react';

/** The lines of how the assistant sees the person, a group to each kind; each opens its sources with Correct and Remove. */
function SeenAsGroups() {
  const assistant = useAssistantName();
  const groups = useAppSelector(selectSeenAsGroups);
  const isLoaded = useAppSelector((state) => state.helm.seenAs.isLoaded);
  const isOn = useAppSelector(selectIsLearningOn);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {isLoaded && groups.length === 0 && (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {isOn
            ? SEEN_AS_WORDS.emptyOn(assistant)
            : SEEN_AS_WORDS.emptyOff(assistant)}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.kind} className='space-y-1'>
          <SectionHeader
            title={SEEN_AS_WORDS.groupTitle(
              SEEN_AS_WORDS.groups[group.kind],
              group.lines.length,
            )}
          />
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {group.lines.map((line) => (
              <li key={line.id}>
                <SeenAsRow
                  line={line}
                  assistant={assistant}
                  onOpen={setOpenId}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SeenAsSheet
        key={openId ?? 'none'}
        lineId={openId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

export default SeenAsGroups;
