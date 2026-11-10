import { useMemo } from 'react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import LinkedTasks from '@apps/helm/components/who/LinkedTasks';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';

interface PlaceDetailProps {
  placeId: string | null;
  onBack: () => void;
  onHome: () => void;
}

/** One place the person named: its name, its address when there is one and the open tasks linked to it. */
function PlaceDetail({ placeId, onBack, onHome }: PlaceDetailProps) {
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

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
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
            <div className='flex items-center gap-4'>
              <WhoMark kind='place' name={place.name} isLarge />
              <div className='min-w-0'>
                <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                  {place.name}
                </h1>
                {(place.isHome || place.address) && (
                  <p className='text-muted-foreground text-[15px] break-words'>
                    {place.isHome ? HELM_COPY.placeHomeLine : place.address}
                  </p>
                )}
              </div>
            </div>
            {place.isHome && place.address && (
              <p className='text-muted-foreground text-[15px] break-words'>
                {place.address}
              </p>
            )}
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
      </main>
    </>
  );
}

export default PlaceDetail;
