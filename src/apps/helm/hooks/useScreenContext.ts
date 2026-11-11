import { useEffect, useId } from 'react';

import { useAppDispatch } from '@/store';
import { SCREEN_VISIBLE_CAP } from '@apps/helm/constants';
import { VIEW_KINDS } from '@apps/helm/screen/views';
import {
  clearScreen,
  publishScreen,
  type ScreenLabels,
  type ScreenPlacement,
} from '@apps/helm/store/screenSlice';
import type { HelmView, RecordRef } from '@apps/helm/types';

/** The views the view table calls content: the only ones that may be asked about. */
export type ContentView = {
  [View in HelmView]: (typeof VIEW_KINDS)[View] extends 'content'
    ? View
    : never;
}[HelmView];

/** Tells the ask control what this content page shows (record ids and the words for the control), and takes it back when the page goes. The latest page to publish is the one in front. */
export function useScreenContext(
  view: ContentView,
  focus: RecordRef | null,
  visible: RecordRef[],
  labels: ScreenLabels,
  placement: ScreenPlacement = 'page',
  topicId: string | null = null,
  procedureId: string | null = null,
) {
  const dispatch = useAppDispatch();
  const ownerId = useId();
  const serialized = JSON.stringify({
    view,
    focus,
    visible: visible.slice(0, SCREEN_VISIBLE_CAP),
    labels,
    placement,
    topicId,
    procedureId,
  });

  useEffect(() => {
    const { view, focus, visible, labels, placement, topicId, procedureId } =
      JSON.parse(serialized) as {
        view: ContentView;
        focus: RecordRef | null;
        visible: RecordRef[];
        labels: ScreenLabels;
        placement: ScreenPlacement;
        topicId: string | null;
        procedureId: string | null;
      };
    dispatch(
      publishScreen({
        ownerId,
        context: { view, focus, visible, topicId, procedureId, v: 1 },
        labels,
        placement,
      }),
    );
  }, [dispatch, ownerId, serialized]);

  useEffect(
    () => () => {
      dispatch(clearScreen(ownerId));
    },
    [dispatch, ownerId],
  );
}
