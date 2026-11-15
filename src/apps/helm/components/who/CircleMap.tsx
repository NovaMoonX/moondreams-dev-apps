import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import type { Core } from 'cytoscape';
import { Info } from 'lucide-react';

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
  MAP_CROWDED_FROM,
  toCircleCard,
  toCircleElements,
  type MapFilter,
} from '@apps/helm/utils/circleMap';
import {
  clearMapPositions,
  readMapPositions,
  writeMapPositions,
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

/** Opens one photo's thumbnail and hands the URL to the map; draws nothing. */
function PhotoLoader({ media, onUrl }: PhotoLoaderProps) {
  const { url } = useMediaUrl(media, 'thumb');
  useEffect(() => {
    onUrl(media.id, url);
  }, [media.id, url, onUrl]);
  return null;
}

const arrange = (cy: Core, saved: MapPositions) => {
  cy.layout({
    name: 'concentric',
    concentric: (node) => node.data('level') as number,
    levelWidth: () => 1,
    minNodeSpacing: 24,
    animate: false,
    fit: true,
    padding: 28,
  }).run();
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const point = saved[node.id()];
      if (point) node.position(point);
    });
  });
};

interface CircleMapProps {
  onOpenWho: (whoId: string) => void;
}

/** The owner's circle as a network: the owner in the middle, each person a circle, a line per link. Cytoscape loads only when this opens. */
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
  const stored = useRef<MapPositions>({});
  const filter =
    chosenFilter ?? (people.length > MAP_CROWDED_FROM ? 'close' : 'everyone');

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
  const card = useMemo(
    () =>
      selectedId === null ? null : toCircleCard({ ...base, id: selectedId }),
    [base, selectedId],
  );
  const selected = people.find((who) => who.id === selectedId) ?? null;
  const addFor = people.find((who) => who.id === addForId) ?? null;
  const loaders = useMemo(() => {
    const shown = new Set(elements.map((element) => element.data.id));
    return people.flatMap((who) => {
      const photo =
        who.photoMediaId === null || !shown.has(who.id)
          ? undefined
          : media.find(
              (entry) =>
                entry.id === who.photoMediaId &&
                entry.status === 'kept' &&
                !entry.isUnreadable,
            );
      return photo && !(isMasked && privateIds.has(who.id)) ? [photo] : [];
    });
  }, [elements, people, media, isMasked, privateIds]);
  const hasLinks = elements.some((element) => element.group === 'edges');

  useEffect(() => {
    let isCancelled = false;
    let made: Core | null = null;
    import('cytoscape')
      .then(({ default: cytoscape }) => {
        if (isCancelled || !container.current) return;
        stored.current = uid ? readMapPositions(uid) : {};
        made = cytoscape({
          container: container.current,
          elements: [],
          style: buildMapStyle(readMapColours()),
          minZoom: 0.2,
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
    const isSame =
      cy.elements().length === elements.length &&
      elements.every((element) =>
        cy.getElementById(String(element.data.id)).nonempty(),
      );
    if (isSame) {
      cy.batch(() => {
        elements
          .filter((element) => element.group === 'nodes')
          .forEach((element) => {
            cy.getElementById(String(element.data.id)).data(element.data);
          });
      });
      return;
    }
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    arrange(cy, stored.current);
  }, [cy, elements]);

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
        [event.target.id() as string]: { x: point.x, y: point.y },
      };
      if (uid) writeMapPositions(uid, stored.current);
    });
    const box = container.current;
    const observer = box && new ResizeObserver(() => cy.resize());
    if (box) observer?.observe(box);
    return () => {
      observer?.disconnect();
      cy.removeAllListeners();
    };
  }, [cy, uid]);

  const handleCloseCard = () => {
    cy?.elements(':selected').unselect();
    setSelectedId(null);
  };

  const handleReset = () => {
    if (uid) clearMapPositions(uid);
    stored.current = {};
    if (cy) arrange(cy, {});
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
          setChosenFilter(value);
          handleCloseCard();
        }}
      />
      <div className='helm-card relative overflow-hidden'>
        <div
          ref={container}
          data-no-swipe
          role='img'
          aria-label={HELM_COPY.mapLabel}
          className='h-[calc(100dvh-20rem)] min-h-80 w-full touch-none'
        />
        <Button
          type='button'
          variant='tertiary'
          aria-label={HELM_COPY.mapLegendOpen}
          onClick={() => setIsLegendOpen(true)}
          className='absolute top-1 right-1 size-10 min-w-0 p-0'
        >
          <Info className='size-5' aria-hidden='true' />
        </Button>
        {(cy === null || !hasLinks || isFailed) && (
          <p className='text-muted-foreground pointer-events-none absolute inset-x-4 bottom-4 text-center text-[13px] text-pretty'>
            {isFailed
              ? HELM_COPY.mapFailed
              : cy === null
                ? HELM_COPY.mapLoading
                : people.length === 0
                  ? HELM_COPY.mapEmpty
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
      {addFor && (
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
