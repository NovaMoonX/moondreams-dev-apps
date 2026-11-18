import { useMemo, useState } from 'react';

import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import FactsSection from '@apps/helm/components/who/FactsSection';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import PlaceEditSheet from '@apps/helm/components/who/PlaceEditSheet';
import PhotoHeader from '@apps/helm/components/media/PhotoHeader';
import PhotosSection from '@apps/helm/components/media/PhotosSection';
import { HELM_COPY } from '@apps/helm/constants';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { forgetPlace } from '@apps/helm/store/actions/placeActions';
import {
  countLinkedTasks,
  countOnlyFacts,
  ForgetPartialError,
} from '@apps/helm/store/actions/whoActions';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';

const { option } = DropdownMenuFactories;

interface PlaceDetailProps {
  placeId: string | null;
  /** Where Back lands when it is not Home. */
  backLabel?: string;
  onBack: () => void;
  onHome: () => void;
}

/** One place the person named: its name, its address when there is one and the open tasks linked to it. */
function PlaceDetail({
  placeId,
  backLabel = 'Home',
  onBack,
  onHome,
}: PlaceDetailProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { items, isLoaded } = useAppSelector((state) => state.helm.places);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const place = items.find((entry) => entry.id === placeId) ?? null;
  const name = place && !place.isUnreadable ? place.name : '';

  const tasks = useMemo(
    () =>
      openTasks
        .filter((task) => placeId !== null && task.placeIds.includes(placeId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [openTasks, placeId],
  );

  useScreenContext(
    'place',
    null,
    tasks.map((task) => ({ collection: 'tasks' as const, id: task.id })),
    {
      ask: name ? HELM_COPY.askPlace(name) : HELM_COPY.askPeople(0),
      chip: HELM_COPY.chipAbout(name || HELM_COPY.linkedPlace),
      back: name ? HELM_COPY.backToWho(name) : HELM_COPY.backToPeople,
    },
  );

  const forget = async () => {
    if (!user || !place) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.forgetNeedsConnection, type: 'info' });
      return;
    }
    const linkedCount = await countLinkedTasks(
      user.uid,
      'places',
      place.id,
    ).catch((error: unknown) => {
      console.error('Helm links were not counted', error);
      return null;
    });
    const factCount = await countOnlyFacts(user.uid, place.id).catch(
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
      title: HELM_COPY.whoForgetMenu(place.name),
      message: HELM_COPY.forgetConfirmPlace(
        place.name,
        linkedCount,
        place.photoMediaIds.length,
        factCount,
      ),
      confirmText: HELM_COPY.forgetAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { counts, restore } = await forgetPlace(user.uid, place.id);
      onBack();
      addToast({
        title: HELM_COPY.forgotToast(place.name, counts.tasks),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restore().then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'withoutPhotos'
                      ? HELM_COPY.forgotUndoneWithoutPhotos(place.name)
                      : HELM_COPY.forgotUndone(place.name),
                  type: 'info',
                }),
              (error: unknown) => {
                console.error('Helm forgotten place was not restored', error);
                addToast({ title: HELM_COPY.forgotUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm place was not forgotten', error);
      addToast({
        title:
          error instanceof ForgetPartialError
            ? HELM_COPY.forgetPartial(place.name)
            : HELM_COPY.forgetFailed,
        type: 'error',
      });
    }
  };

  const menu =
    place && !place.isUnreadable
      ? {
          items: [
            option({ label: HELM_COPY.placeEditMenu, value: 'edit' }),
            option({
              label: HELM_COPY.whoForgetMenu(place.name),
              value: 'forget',
            }),
          ],
          onItemSelect: (value: string) => {
            if (value === 'forget') void forget();
            else if (value === 'edit') setIsEditOpen(true);
          },
        }
      : undefined;

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={onBack}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !place && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.whoGone}
          </p>
        )}
        {place?.isUnreadable && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.whoUnreadable}
          </p>
        )}
        {place && !place.isUnreadable && (
          <>
            <PhotoHeader
              owner={{ kind: 'place', id: place.id }}
              kind='place'
              name={place.name}
              mainId={place.photoMediaIds[0] ?? null}
              photoCount={place.photoMediaIds.length}
            >
              <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                {place.name}
              </h1>
              {(place.isHome || place.address) && (
                <p className='text-muted-foreground text-[15px] break-words'>
                  {place.isHome ? HELM_COPY.placeHomeLine : place.address}
                </p>
              )}
            </PhotoHeader>
            {place.isHome && place.address && (
              <p className='text-muted-foreground text-[15px] break-words'>
                {place.address}
              </p>
            )}
            <PhotosSection
              owner={{ kind: 'place', id: place.id }}
              name={place.name}
              photoIds={place.photoMediaIds}
              mainId={place.photoMediaIds[0] ?? null}
            />
            <FactsSection
              subject={{ kind: 'place', id: place.id }}
              name={place.name}
            />
            <section className='space-y-3'>
              <SectionDivider label={HELM_COPY.whoTasksTitle} />
              <LinkedTasks
                tasks={tasks}
                emptyLine={HELM_COPY.placeTasksEmpty}
                view='place'
                ownerId={place.id}
              />
            </section>
          </>
        )}
        {place && !place.isUnreadable && (
          <PrivateRow kind='place' record={place} title={place.name} />
        )}
      </main>
      {place && !place.isUnreadable && (
        <PlaceEditSheet
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          place={place}
        />
      )}
    </>
  );
}

export default PlaceDetail;
