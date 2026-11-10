import { useMemo, useState } from 'react';

import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import WhoEditSheet from '@apps/helm/components/who/WhoEditSheet';
import PhotosSection from '@apps/helm/components/media/PhotosSection';
import WhoPhoto from '@apps/helm/components/who/WhoPhoto';
import WhoTierSheet from '@apps/helm/components/who/WhoTierSheet';
import { HELM_COPY, MENTIONS_SHOWN } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  countLinkedTasks,
  ForgetPartialError,
  forgetWho,
} from '@apps/helm/store/actions/whoActions';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { getWhoLine } from '@apps/helm/utils/whoGroups';

const { option } = DropdownMenuFactories;

interface WhoDetailProps {
  whoId: string | null;
  onBack: () => void;
  onHome: () => void;
}

/** One person, pet or organization: what it is, the facts kept about it, its open tasks and the turns that named it. */
function WhoDetail({ whoId, onBack, onHome }: WhoDetailProps) {
  const assistant = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { items, isLoaded } = useAppSelector((state) => state.helm.who);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const captures = useAppSelector(selectAllCaptures);
  const [isAllMentions, setIsAllMentions] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'tier' | null>(null);
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

  const forget = async () => {
    if (!user || !who || who.isSelf) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.forgetNeedsConnection, type: 'info' });
      return;
    }
    const linkedCount = await countLinkedTasks(user.uid, 'who', who.id).catch(
      (error: unknown) => {
        console.error('Helm links were not counted', error);
        return null;
      },
    );
    if (linkedCount === null) {
      addToast({ title: HELM_COPY.forgetFailed, type: 'error' });
      return;
    }
    const isConfirmed = await confirm({
      title: HELM_COPY.whoForgetMenu(who.name),
      message: HELM_COPY.forgetConfirmWho(
        who.name,
        linkedCount,
        who.mediaIds.length,
      ),
      confirmText: HELM_COPY.forgetAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { counts, restore } = await forgetWho(user.uid, who.id);
      onBack();
      addToast({
        title: HELM_COPY.forgotToast(who.name, counts.tasks),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restore().then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'withoutPhotos'
                      ? HELM_COPY.forgotUndoneWithoutPhotos(who.name)
                      : HELM_COPY.forgotUndone(who.name),
                  type: 'info',
                }),
              (error: unknown) => {
                console.error('Helm forgotten person was not restored', error);
                addToast({ title: HELM_COPY.forgotUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm person was not forgotten', error);
      addToast({
        title:
          error instanceof ForgetPartialError
            ? HELM_COPY.forgetPartial(who.name)
            : HELM_COPY.forgetFailed,
        type: 'error',
      });
    }
  };

  const menu =
    who && !who.isUnreadable
      ? {
          items: [
            option({ label: HELM_COPY.whoEditMenu, value: 'edit' }),
            ...(who.isSelf
              ? []
              : [
                  option({ label: HELM_COPY.whoTierMenu, value: 'tier' }),
                  option({
                    label: HELM_COPY.whoForgetMenu(who.name),
                    value: 'forget',
                  }),
                ]),
          ],
          onItemSelect: (value: string) => {
            if (value === 'forget') void forget();
            else if (value === 'edit' || value === 'tier') setSheet(value);
          },
        }
      : undefined;

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
        menu={menu}
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
              <WhoPhoto
                kind={who.kind}
                name={who.name}
                mediaId={who.photoMediaId}
                isLarge
              />
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
            <PhotosSection
              owner={{ kind: 'who', id: who.id }}
              name={who.name}
              photoIds={who.mediaIds}
              mainId={who.photoMediaId}
            />
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
      {who && !who.isUnreadable && (
        <>
          <WhoEditSheet
            isOpen={sheet === 'edit'}
            onClose={() => setSheet(null)}
            who={who}
          />
          <WhoTierSheet
            isOpen={sheet === 'tier'}
            onClose={() => setSheet(null)}
            who={who}
          />
        </>
      )}
    </>
  );
}

export default WhoDetail;
