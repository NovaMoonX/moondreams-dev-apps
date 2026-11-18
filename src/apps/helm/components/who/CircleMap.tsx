import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { Button, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { Core } from 'cytoscape';
import { Info, Lock, Maximize, ZoomIn, ZoomOut } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import CircleMapCard from '@apps/helm/components/who/CircleMapCard';
import CircleMapLegend from '@apps/helm/components/who/CircleMapLegend';
import CircleMapLineSheet from '@apps/helm/components/who/CircleMapLineSheet';
import ConnectionSheet from '@apps/helm/components/who/ConnectionSheet';
import FiguredOutSheet from '@apps/helm/components/who/FiguredOutSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useMediaUrl } from '@apps/helm/hooks/useMediaUrl';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
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
  toCircleLine,
  toCircleSummary,
  type MapLine,
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
/** A node is drawn 44px across at zoom 1, so the first view never goes below it. */
const MIN_FIRST_ZOOM = 1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.4;

const fitAll = (cy: Core) => {
  cy.fit(undefined, FIT_PADDING);
  if (cy.zoom() > MAX_FIT_ZOOM) {
    cy.zoom(MAX_FIT_ZOOM);
    cy.center();
  }
};

const arrange = (cy: Core, saved: MapPositions, isFitNeeded: boolean) => {
  const view = { zoom: cy.zoom(), pan: cy.pan() };
  cy.layout({
    name: 'concentric',
    concentric: (node) => node.data('level') as number,
    levelWidth: () => 1,
    minNodeSpacing: 40,
    spacingFactor: 1.3,
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
  fitAll(cy);
  if (cy.zoom() < MIN_FIRST_ZOOM) {
    cy.zoom(MIN_FIRST_ZOOM);
    cy.center(cy.nodes('[?isOwner]'));
  }
};

interface HoverPoint {
  id: string;
  x: number;
  y: number;
}

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
  const [lineId, setLineId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<MapLine | null>(null);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const todayKey = useTodayKey();
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const keyDatesByWho = useAppSelector(
    (state) => state.helm.keyDateIndex.byWho,
  );
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
  const summary = useMemo(
    () =>
      selectedId === null || !isSelectedShown
        ? []
        : toCircleSummary({
            ...base,
            id: selectedId,
            tasks: openTasks,
            keyDates: keyDatesByWho[selectedId] ?? [],
            todayKey,
            lastMentionedAt:
              people.find((who) => who.id === selectedId)?.lastMentionedAt ??
              null,
          }),
    [
      base,
      selectedId,
      isSelectedShown,
      openTasks,
      keyDatesByWho,
      todayKey,
      people,
    ],
  );
  const line = useMemo(
    () => (lineId === null ? null : toCircleLine({ ...base, id: lineId })),
    [base, lineId],
  );
  const hoverLine = useMemo(
    () => (hover === null ? null : toCircleLine({ ...base, id: hover.id })),
    [base, hover],
  );
  const editWho = editLine
    ? (people.find((who) => who.id === editLine.whoIds[0]) ?? null)
    : null;
  const editOther = editLine
    ? (people.find((who) => who.id === editLine.whoIds[1]) ?? null)
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
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          wheelSensitivity: 0.25,
          boxSelectionEnabled: false,
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
    const canHover = window.matchMedia('(hover: hover)').matches;
    cy.on('tap', (event) => {
      setHover(null);
      if (event.target === cy) {
        setSelectedId(null);
        setLineId(null);
      } else if (event.target.isNode()) {
        setLineId(null);
        setSelectedId(event.target.id() as string);
      } else if (event.target.isEdge()) {
        setSelectedId(null);
        setLineId(event.target.id() as string);
      }
    });
    if (canHover) {
      cy.on('mouseover', 'edge', (event) =>
        setHover({
          id: event.target.id() as string,
          x: event.renderedPosition.x,
          y: event.renderedPosition.y,
        }),
      );
      cy.on('mouseout', 'edge', () => setHover(null));
    }
    cy.on('pan zoom', () => setHover(null));
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

  const handleZoom = (factor: number) => {
    if (!cy) return;
    cy.zoom({
      level: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cy.zoom() * factor)),
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const isEditHidden =
    isMasked &&
    editLine !== null &&
    editLine.whoIds.some((id) => privateIds.has(id));

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
            'h-[calc(100svh-29.5rem)] min-h-64 w-full touch-none',
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
        {hover && hoverLine && !isCovered && (
          <span
            className='pointer-events-none absolute z-10'
            style={{ left: hover.x, top: hover.y }}
          >
            <Popover
              isOpen
              placement='top'
              alignment='center'
              offset={10}
              closeOnOverlayClick={false}
              className='pointer-events-none w-64 p-3 text-[13px]'
              trigger={<span className='block size-px' />}
            >
              <p className='text-foreground text-pretty'>
                {hoverLine.sentence}
              </p>
              {hoverLine.note && (
                <p className='text-muted-foreground mt-1 text-pretty'>
                  {hoverLine.note}
                </p>
              )}
            </Popover>
          </span>
        )}
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
        <div
          role='group'
          aria-label={HELM_COPY.mapZoomLabel}
          className='border-border flex justify-end gap-1 border-t p-1'
        >
          {(
            [
              [HELM_COPY.mapZoomOut, ZoomOut, () => handleZoom(1 / ZOOM_STEP)],
              [HELM_COPY.mapZoomIn, ZoomIn, () => handleZoom(ZOOM_STEP)],
              [HELM_COPY.mapZoomFit, Maximize, () => cy && fitAll(cy)],
            ] as const
          ).map(([label, Icon, onClick]) => (
            <Button
              key={label}
              type='button'
              variant='tertiary'
              aria-label={label}
              disabled={cy === null}
              onClick={onClick}
              className='size-10 min-w-0 rounded-full p-0 [&_svg]:size-5'
            >
              <Icon className='size-5 shrink-0' aria-hidden='true' />
            </Button>
          ))}
        </div>
      </div>
      {loaders.map((photo) => (
        <PhotoLoader key={photo.id} media={photo} onUrl={photoStore.set} />
      ))}
      <CircleMapCard
        card={card}
        summary={summary}
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
      <CircleMapLineSheet
        line={line}
        onChange={
          line && (line.connectionId !== null || line.isGuess)
            ? () => {
                setEditLine(line);
                setLineId(null);
              }
            : null
        }
        onClose={() => setLineId(null)}
      />
      <CircleMapLegend
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
        onReset={handleReset}
        colours={colours}
      />
      {editLine &&
        editWho &&
        !isEditHidden &&
        editLine.connectionId !== null && (
          <ConnectionSheet
            isOpen
            onClose={() => setEditLine(null)}
            who={editWho}
            target={{ kind: 'row', id: editLine.connectionId }}
          />
        )}
      {editLine && editWho && !isEditHidden && editLine.isGuess && (
        <FiguredOutSheet
          isOpen
          onClose={() => setEditLine(null)}
          who={editWho}
          otherId={editOther?.id ?? null}
        />
      )}
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
