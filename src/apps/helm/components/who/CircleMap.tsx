import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { Core } from 'cytoscape';
import { Info, Lock } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import CircleMapCard from '@apps/helm/components/who/CircleMapCard';
import CircleMapLegend from '@apps/helm/components/who/CircleMapLegend';
import ConnectionSheet from '@apps/helm/components/who/ConnectionSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useMediaUrl } from '@apps/helm/hooks/useMediaUrl';
import {
  selectFiguredOutByWho,
  selectShownConnections,
} from '@apps/helm/store/selectors/connectionSelectors';
import { selectParentIndex } from '@apps/helm/store/selectors/privacySelectors';
import type { OpenMedia } from '@apps/helm/types';
import {
  countMapPeople,
  isMapCovered,
  MAP_CROWDED_FROM,
  toCircleCard,
  toCircleElements,
  toElementSignature,
  type MapFilter,
} from '@apps/helm/utils/circleMap';
import {
  clearMapLayouts,
  readMapLayouts,
  writeMapLayouts,
  type MapLayouts,
  type MapPositions,
} from '@apps/helm/utils/circleMapPositions';
import {
  buildMapStyle,
  readMapColours,
  type MapColours,
} from '@apps/helm/utils/circleMapStyle';
import { readPresence, subscribeTouch } from '@apps/helm/utils/presence';
import { readRecordPrivacy } from '@apps/helm/utils/privacyParents';

const FILTER_OPTIONS = [
  { value: 'close', label: HELM_COPY.mapFilterClose },
  { value: 'family', label: HELM_COPY.mapFilterFamily },
  { value: 'everyone', label: HELM_COPY.mapFilterEveryone },
] as const;

const NO_PHOTOS: Readonly<Record<string, string>> = {};

const subscribeMasked = (listener: () => void) => {
  const stopTouch = subscribeTouch(listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    stopTouch();
    document.removeEventListener('visibilitychange', listener);
  };
};

const readIsMasked = () => {
  const presence = readPresence();
  return presence.isHidden || presence.isUntouched;
};

const subscribeTheme = (listener: () => void) => {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', listener);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', listener);
  };
};

const readColourSignature = () => JSON.stringify(readMapColours());

const createPhotoStore = () => {
  const listeners = new Set<() => void>();
  const state = { photos: NO_PHOTOS };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state.photos,
    set: (id: string, url: string | null) => {
      if ((state.photos[id] ?? null) === url) return;
      state.photos = Object.fromEntries([
        ...Object.entries(state.photos).filter(([key]) => key !== id),
        ...(url === null ? [] : [[id, url]]),
      ]);
      listeners.forEach((listener) => listener());
    },
  };
};

interface PhotoLoaderProps {
  media: OpenMedia;
  onUrl: (id: string, url: string | null) => void;
}

function PhotoLoader({ media, onUrl }: PhotoLoaderProps) {
  const { url } = useMediaUrl(media, 'thumb');
  useEffect(() => {
    onUrl(media.id, url);
    return () => onUrl(media.id, null);
  }, [media.id, url, onUrl]);
  return null;
}

const FIT_PADDING = 12;
const MAX_FIT_ZOOM = 1.25;

const arrange = (cy: Core, saved: MapPositions, isFitNeeded: boolean) => {
  const view = { zoom: cy.zoom(), pan: cy.pan() };
  cy.layout({
    name: 'concentric',
    concentric: (node) => node.data('level') as number,
    levelWidth: () => 1,
    minNodeSpacing: 24,
    animate: false,
    fit: false,
  }).run();
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const point = saved[node.id()];
      if (point) node.position(point);
    });
  });
  if (!isFitNeeded) {
    cy.viewport(view);
    return;
  }
  cy.fit(undefined, FIT_PADDING);
  if (cy.zoom() > MAX_FIT_ZOOM) {
    cy.zoom(MAX_FIT_ZOOM);
    cy.center();
  }
};

interface CircleMapProps {
  onOpenWho: (whoId: string) => void;
}

function CircleMap({ onOpenWho }: CircleMapProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { addToast } = useToast();
  const people = useAppSelector((state) => state.helm.who.items);
  const media = useAppSelector((state) => state.helm.media.items);
  const connections = useAppSelector(selectShownConnections);
  const figuredOut = useAppSelector(selectFiguredOutByWho);
  const selfId = useAppSelector(
    (state) => state.helm.profile?.selfWhoId ?? null,
  );
  const parentIndex = useAppSelector(selectParentIndex);
  const isMasked = useSyncExternalStore(subscribeMasked, readIsMasked);
  const colourSignature = useSyncExternalStore(
    subscribeTheme,
    readColourSignature,
  );
  const colours = useMemo(
    () => JSON.parse(colourSignature) as MapColours,
    [colourSignature],
  );
  const photoStore = useMemo(() => createPhotoStore(), []);
  const photoUrls = useSyncExternalStore(
    photoStore.subscribe,
    photoStore.getSnapshot,
  );
  const [chosenFilter, setChosenFilter] = useState<MapFilter | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [isFailed, setIsFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addForId, setAddForId] = useState<string | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const stored = useRef<MapLayouts>({});
  const isFitNeeded = useRef(true);
  const drawnSignature = useRef<string | null>(null);
  const filter =
    chosenFilter ??
    (countMapPeople(people, selfId) > MAP_CROWDED_FROM ? 'close' : 'everyone');

  const privateIds = useMemo(
    () =>
      new Set(
        people
          .filter(
            (who) => readRecordPrivacy('who', who, parentIndex) === 'private',
          )
          .map((who) => who.id),
      ),
    [people, parentIndex],
  );
  const base = useMemo(
    () => ({ people, connections, figuredOut, selfId, isMasked, privateIds }),
    [people, connections, figuredOut, selfId, isMasked, privateIds],
  );
  const elements = useMemo(
    () => toCircleElements({ ...base, filter, photoUrls }),
    [base, filter, photoUrls],
  );
  const isSelectedShown =
    selectedId !== null &&
    elements.some(
      (element) => element.group === 'nodes' && element.data.id === selectedId,
    );
  const card = useMemo(
    () =>
      selectedId === null || !isSelectedShown
        ? null
        : toCircleCard({ ...base, id: selectedId }),
    [base, selectedId, isSelectedShown],
  );
  const selected = isSelectedShown
    ? (people.find((who) => who.id === selectedId) ?? null)
    : null;
  const addFor = people.find((who) => who.id === addForId) ?? null;
  const mediaById = useMemo(
    () => new Map(media.map((entry) => [entry.id, entry])),
    [media],
  );
  const loaders = useMemo(() => {
    const shown = new Set(elements.map((element) => element.data.id));
    return people.flatMap((who) => {
      const photo =
        who.photoMediaId === null || !shown.has(who.id)
          ? undefined
          : mediaById.get(who.photoMediaId);
      return photo &&
        photo.status === 'kept' &&
        !photo.isUnreadable &&
        !(isMasked && privateIds.has(who.id))
        ? [photo]
        : [];
    });
  }, [elements, people, mediaById, isMasked, privateIds]);
  const hasLinks = elements.some((element) => element.group === 'edges');
  const isCovered = isMapCovered({ isMasked, privateIds, elements });
  const hasLinksAnywhere = useMemo(
    () =>
      toCircleElements({
        ...base,
        filter: 'everyone',
        photoUrls: NO_PHOTOS,
      }).some((element) => element.group === 'edges'),
    [base],
  );

  useEffect(() => {
    let isCancelled = false;
    let made: Core | null = null;
    import('cytoscape')
      .then(({ default: cytoscape }) => {
        if (isCancelled || !container.current) return;
        stored.current = uid ? readMapLayouts(uid) : {};
        isFitNeeded.current = true;
        drawnSignature.current = null;
        made = cytoscape({
          container: container.current,
          elements: [],
          style: buildMapStyle(readMapColours()),
          minZoom: 0.05,
          maxZoom: 3,
          wheelSensitivity: 0.25,
          boxSelectionEnabled: false,
          textureOnViewport: true,
        });
        setCy(made);
      })
      .catch((error: unknown) => {
        console.error('The circle map did not load', error);
        if (!isCancelled) setIsFailed(true);
      });
    return () => {
      isCancelled = true;
      made?.destroy();
      setCy(null);
    };
  }, [uid]);

  useEffect(() => {
    cy?.style(buildMapStyle(colours));
  }, [cy, colours]);

  useEffect(() => {
    if (!cy) return;
    const signature = `${filter}#${toElementSignature(elements)}`;
    if (signature === drawnSignature.current) {
      cy.batch(() => {
        elements.forEach((element) => {
          cy.getElementById(String(element.data.id)).data(element.data);
        });
      });
      return;
    }
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    drawnSignature.current = signature;
    arrange(cy, stored.current[filter] ?? {}, isFitNeeded.current);
    isFitNeeded.current = false;
  }, [cy, elements, filter]);

  useEffect(() => {
    if (!cy) return;
    cy.on('tap', (event) => {
      if (event.target === cy) setSelectedId(null);
      else if (event.target.isNode())
        setSelectedId(event.target.id() as string);
    });
    cy.on('dragfree', 'node', (event) => {
      const point = event.target.position();
      stored.current = {
        ...stored.current,
        [filter]: {
          ...stored.current[filter],
          [event.target.id() as string]: { x: point.x, y: point.y },
        },
      };
      if (uid) writeMapLayouts(uid, stored.current);
    });
    const box = container.current;
    const observer = box && new ResizeObserver(() => cy.resize());
    if (box) observer?.observe(box);
    return () => {
      observer?.disconnect();
      cy.removeAllListeners();
    };
  }, [cy, uid, filter]);

  const handleCloseCard = () => {
    cy?.elements(':selected').unselect();
    setSelectedId(null);
  };

  const handleReset = () => {
    if (uid) clearMapLayouts(uid);
    stored.current = {};
    if (cy) arrange(cy, {}, true);
    setIsLegendOpen(false);
    addToast({ title: HELM_COPY.mapResetDone, type: 'success' });
  };

  return (
    <div className='space-y-3'>
      <PillGroup
        isThin
        label={HELM_COPY.mapFiltersLabel}
        options={FILTER_OPTIONS}
        value={filter}
        onChange={(value) => {
          isFitNeeded.current = true;
          setChosenFilter(value);
          handleCloseCard();
        }}
      />
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.mapHint}
      </p>
      <div className='helm-card relative overflow-hidden'>
        <div
          ref={container}
          data-no-swipe
          role='img'
          aria-label={HELM_COPY.mapLabel}
          className={join(
            'h-[calc(100svh-26.5rem)] min-h-64 w-full touch-none',
            isCovered && 'invisible',
          )}
        />
        {isCovered && (
          <div className='bg-card text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[13px]'>
            <Lock className='size-5' aria-hidden='true' />
            <p>{HELM_COPY.mapCovered}</p>
          </div>
        )}
        <Button
          type='button'
          variant='tertiary'
          aria-label={HELM_COPY.mapLegendOpen}
          onClick={() => setIsLegendOpen(true)}
          className='border-border bg-card absolute top-1 right-1 size-10 min-w-0 rounded-full border p-0 [&_svg]:size-5'
        >
          <Info className='size-5 shrink-0' aria-hidden='true' />
        </Button>
        {(cy === null || !hasLinks || isFailed) && (
          <p className='text-muted-foreground pointer-events-none absolute top-4 right-14 left-4 text-left text-[13px] text-pretty'>
            {isFailed
              ? HELM_COPY.mapFailed
              : cy === null
                ? HELM_COPY.mapLoading
                : filter !== 'everyone' && hasLinksAnywhere
                  ? HELM_COPY.mapNoLinksFiltered
                  : HELM_COPY.mapNoLinks}
          </p>
        )}
      </div>
      {loaders.map((photo) => (
        <PhotoLoader key={photo.id} media={photo} onUrl={photoStore.set} />
      ))}
      <CircleMapCard
        card={card}
        onClose={handleCloseCard}
        onOpen={selected ? () => onOpenWho(selected.id) : null}
        onAddConnection={
          selected?.kind === 'person'
            ? () => {
                setAddForId(selected.id);
                handleCloseCard();
              }
            : null
        }
      />
      <CircleMapLegend
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
        onReset={handleReset}
        colours={colours}
      />
      {addFor && !(isMasked && privateIds.has(addFor.id)) && (
        <ConnectionSheet
          isOpen
          onClose={() => setAddForId(null)}
          who={addFor}
          target={{ kind: 'add' }}
        />
      )}
    </div>
  );
}

export default CircleMap;
