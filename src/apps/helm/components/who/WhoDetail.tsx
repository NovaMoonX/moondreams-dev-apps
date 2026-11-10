import { useMemo, useState } from 'react';

import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { HELM_COPY, MENTIONS_SHOWN } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { getWhoLine } from '@apps/helm/utils/whoGroups';

interface WhoDetailProps {
  whoId: string | null;
  onBack: () => void;
  onHome: () => void;
}

/** One person, pet or organization: what it is, the facts kept about it, its open tasks and the turns that named it. */
function WhoDetail({ whoId, onBack, onHome }: WhoDetailProps) {
  const assistant = useAssistantName();
  const { items, isLoaded } = useAppSelector((state) => state.helm.who);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const captures = useAppSelector(selectAllCaptures);
  const [isAllMentions, setIsAllMentions] = useState(false);
  const who = items.find((entry) => entry.id === whoId) ?? null;
  const name = who && !who.isUnreadable ? who.name : '';

  const tasks = useMemo(
    () =>
      openTasks
        .filter((task) => whoId !== null && task.whoIds.includes(whoId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [openTasks, whoId],
  );
  const mentions = useMemo(
    () =>
      captures
        .filter((capture) => whoId !== null && capture.whoIds.includes(whoId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [captures, whoId],
  );
  const shownMentions = isAllMentions
    ? mentions
    : mentions.slice(0, MENTIONS_SHOWN);

  useScreenContext(
    'who',
    null,
    tasks.map((task) => ({ collection: 'tasks' as const, id: task.id })),
    {
      ask: name ? HELM_COPY.askWho(name) : HELM_COPY.askPeople(1),
      chip: HELM_COPY.chipAbout(name || HELM_COPY.peopleTitle),
      back: name ? HELM_COPY.backToWho(name) : HELM_COPY.backToPeople,
    },
  );

  const line = who
    ? getWhoLine(who, {
        you: HELM_COPY.youLabel,
        pet: HELM_COPY.petKindFallback,
        organization: HELM_COPY.organizationKindFallback,
      })
    : '';

  return (
    <>
      <HelmHeader
        backLabel={HELM_COPY.peopleTitle}
        onBack={onBack}
        onHome={onHome}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !who && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.whoGone}
          </p>
        )}
        {who?.isUnreadable && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.whoUnreadable}
          </p>
        )}
        {who && !who.isUnreadable && (
          <>
            <div className='flex items-start gap-4'>
              <WhoMark kind={who.kind} name={who.name} isLarge />
              <div className='min-w-0'>
                <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                  {who.name}
                </h1>
                {line && (
                  <p className='text-muted-foreground text-[15px] break-words'>
                    {line}
                  </p>
                )}
              </div>
            </div>
            <section className='space-y-3'>
              <SectionDivider label={HELM_COPY.whoFactsTitle} />
              <p className='text-muted-foreground text-[15px] text-pretty'>
                {HELM_COPY.whoFactsEmpty(assistant)}
              </p>
            </section>
            <section className='space-y-3'>
              <SectionDivider label={HELM_COPY.whoTasksTitle} />
              <LinkedTasks
                tasks={tasks}
                emptyLine={HELM_COPY.whoTasksEmpty}
                view='who'
                ownerId={who.id}
              />
            </section>
            <section className='space-y-3'>
              <SectionDivider label={HELM_COPY.whoMentionsTitle} />
              {mentions.length === 0 ? (
                <p className='text-muted-foreground text-[15px] text-pretty'>
                  {HELM_COPY.whoMentionsEmpty}
                </p>
              ) : (
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {shownMentions.map((capture) => (
                    <li key={capture.id} className='px-4 py-3'>
                      <p className='text-[15px] break-words'>
                        {capture.isUnreadable
                          ? HELM_COPY.unreadable
                          : capture.text}
                      </p>
                      <p className='text-muted-foreground text-[13px]'>
                        {formatDateShort(capture.createdAt)} ·{' '}
                        {formatTime(capture.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {mentions.length > MENTIONS_SHOWN && (
                <ShowMoreButton
                  isOpen={isAllMentions}
                  onClick={() => setIsAllMentions((isOpen) => !isOpen)}
                >
                  {isAllMentions
                    ? HELM_COPY.showFewerMentions
                    : HELM_COPY.showAllMentions(mentions.length)}
                </ShowMoreButton>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default WhoDetail;
