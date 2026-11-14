import { useMemo, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import LockedButton from '@/components/LockedButton';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import FactsSection from '@apps/helm/components/who/FactsSection';
import KeyDatesList from '@apps/helm/components/who/KeyDatesList';
import MomentsPreview from '@apps/helm/components/who/MomentsPreview';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import WhereCard from '@apps/helm/components/where/WhereCard';
import WhoEditSheet from '@apps/helm/components/who/WhoEditSheet';
import WhoNamesCard from '@apps/helm/components/who/WhoNamesCard';
import PhotoHeader from '@apps/helm/components/media/PhotoHeader';
import PhotosSection from '@apps/helm/components/media/PhotosSection';
import WhoTierSheet from '@apps/helm/components/who/WhoTierSheet';
import {
  HELM_COPY,
  MENTIONS_SHOWN,
  PROJECTS_SHOWN,
} from '@apps/helm/constants';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { selectActiveProjects } from '@apps/helm/store/selectors/projectSelectors';
import { useContactsReport } from '@apps/helm/hooks/useContactsReport';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  countLinkedTasks,
  countOnlyFacts,
  ForgetPartialError,
  forgetWho,
} from '@apps/helm/store/actions/whoActions';
import { useImportContacts } from '@apps/helm/queries/contactsQueries';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { getWhoLine } from '@apps/helm/utils/whoGroups';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';

const { option } = DropdownMenuFactories;

interface WhoDetailProps {
  whoId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
}

/** One person, pet or organization: what it is, the facts kept about it, its open tasks and the turns that named it. */
function WhoDetail({ whoId, backLabel, onBack, onHome }: WhoDetailProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { begin } = useGoogleConnect();
  const isOffline = useNetworkStatus() === 'offline';
  const { reportDone, toFailureLine } = useContactsReport();
  const { items, isLoaded } = useAppSelector((state) => state.helm.who);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const captures = useAppSelector(selectAllCaptures);
  const activeProjects = useAppSelector(selectActiveProjects);
  const { showView } = useHelmUrlState();
  const [isAllMentions, setIsAllMentions] = useState(false);
  const [isAllProjects, setIsAllProjects] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'tier' | 'names' | 'kin' | null>(
    null,
  );
  const who = items.find((entry) => entry.id === whoId) ?? null;
  const name = who && !who.isUnreadable ? who.name : '';
  const importedAccountId = who?.importedFrom?.accountId ?? null;
  const importContacts = useImportContacts({
    onSuccess: (result) => reportDone(result, HELM_COPY.contactsUpToDate),
    onError: (error) => {
      console.error('Helm contact was not updated', error);
      const failure = toFailureLine(error, HELM_COPY.contactsUpdateFailed);
      if (failure === null && importedAccountId !== null)
        begin({ accountId: importedAccountId, connectorId: 'google:contacts' });
      else
        addToast({
          title: failure ?? HELM_COPY.contactsUpdateFailed,
          type: 'error',
        });
    },
  });

  const projectLines = activeProjects
    .flatMap((project) => {
      const role = whoId === null ? undefined : project.whoRoles[whoId];
      return role === 'key' || role === 'involved'
        ? [
            {
              id: project.id,
              text: `${project.emoji ? `${project.emoji} ` : ''}${project.name}`,
              role,
            },
          ]
        : [];
    })
    .sort((a, b) => Number(b.role === 'key') - Number(a.role === 'key'));
  const shownProjects = isAllProjects
    ? projectLines
    : projectLines.slice(0, PROJECTS_SHOWN);

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
    const factCount = await countOnlyFacts(user.uid, who.id).catch(
      (error: unknown) => {
        console.error('Helm facts were not counted', error);
        return null;
      },
    );
    if (linkedCount === null || factCount === null) {
      addToast({ title: HELM_COPY.forgetFailed, type: 'error' });
      return;
    }
    const isConfirmed = await confirm({
      title: HELM_COPY.whoForgetMenu(who.name),
      message: HELM_COPY.forgetConfirmWho(
        who.name,
        linkedCount,
        who.mediaIds.length,
        factCount,
        who.yearlyDateCount,
        who.momentCount,
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
                      : outcome === 'withoutDates'
                        ? HELM_COPY.forgotUndoneWithoutDates(who.name)
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

  const updateFromGoogle = () => {
    if (!who?.importedFrom) return;
    importContacts.mutate({ whoId: who.id });
  };

  const menu =
    who && !who.isUnreadable
      ? {
          items: [
            option({ label: HELM_COPY.whoEditMenu, value: 'edit' }),
            option({ label: HELM_COPY.whoNamesMenu, value: 'names' }),
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
            else if (value === 'edit' || value === 'tier' || value === 'names')
              setSheet(value);
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
        backLabel={backLabel}
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
            <PhotoHeader
              owner={{ kind: 'who', id: who.id }}
              kind={who.kind}
              name={who.name}
              mainId={who.photoMediaId}
              photoCount={who.mediaIds.length}
            >
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                {who.name}
              </h1>
              {line && (
                <p className='text-muted-foreground text-[15px] break-words'>
                  {line}
                </p>
              )}
            </PhotoHeader>
            <WhoNamesCard
              who={who}
              openSheet={sheet === 'names' || sheet === 'kin' ? sheet : null}
              onOpen={setSheet}
            />
            {projectLines.length > 0 && (
              <section className='space-y-3'>
                <SectionDivider label={HELM_COPY.whoProjectsTitle} />
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {shownProjects.map((line) => (
                    <li key={line.id}>
                      <Button
                        type='button'
                        variant='tertiary'
                        className='text-foreground flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                        onClick={() => void showView('project', line.id)}
                      >
                        <span className='min-w-0 flex-1'>
                          <span className='text-foreground block text-[15px] break-words'>
                            {line.text}
                          </span>
                          <span className='text-muted-foreground block text-[13px]'>
                            {HELM_COPY.whoProjectPart(line.role)}
                          </span>
                        </span>
                        <ChevronRight
                          className='text-muted-foreground size-4 shrink-0'
                          aria-hidden='true'
                        />
                      </Button>
                    </li>
                  ))}
                </ul>
                {projectLines.length > PROJECTS_SHOWN && (
                  <ShowMoreButton
                    isOpen={isAllProjects}
                    onClick={() => setIsAllProjects((isOpen) => !isOpen)}
                  >
                    {isAllProjects
                      ? HELM_COPY.showFewerProjects
                      : HELM_COPY.showAllProjects(projectLines.length)}
                  </ShowMoreButton>
                )}
              </section>
            )}
            {who.importedFrom && (
              <section className='helm-card space-y-2 p-4'>
                <p className='text-[15px]'>{HELM_COPY.contactsFromGoogle}</p>
                <p className='text-muted-foreground text-[13px] text-pretty'>
                  {HELM_COPY.contactsUpdateHint}
                </p>
                {isOffline ? (
                  <LockedButton
                    label={HELM_COPY.contactsUpdate}
                    title={HELM_COPY.connectionsNeedConnection}
                    size='sm'
                  >
                    <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
                  </LockedButton>
                ) : (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    loading={importContacts.isPending}
                    onClick={updateFromGoogle}
                  >
                    {HELM_COPY.contactsUpdate}
                  </Button>
                )}
              </section>
            )}
            <PhotosSection
              owner={{ kind: 'who', id: who.id }}
              name={who.name}
              photoIds={who.mediaIds}
              mainId={who.photoMediaId}
            />
            <WhereCard who={who} />
            <KeyDatesList who={who} />
            <MomentsPreview who={who} />
            <FactsSection
              subject={{ kind: 'who', id: who.id }}
              name={who.name}
            />
            <section className='space-y-3'>
              <SectionDivider label={HELM_COPY.whoTasksTitle} />
              <LinkedTasks
                tasks={tasks}
                emptyLine={HELM_COPY.whoTasksEmpty}
                view='who'
                ownerId={who.id}
              />
            </section>
            {mentions.length > 0 && (
              <section className='space-y-3'>
                <SectionDivider label={HELM_COPY.whoMentionsTitle} />
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
            )}
          </>
        )}
        {who && !who.isUnreadable && (
          <PrivateRow kind='who' record={who} title={who.name} />
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
