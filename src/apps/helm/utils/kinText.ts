import { HELM_COPY, KIN_KINDS } from '@apps/helm/constants';
import type { KinOrder, WhoKin } from '@apps/helm/types';

export const KIN_ORDER_LABELS: Record<KinOrder, string> = {
  older: HELM_COPY.kinOrderOlder,
  younger: HELM_COPY.kinOrderYounger,
  oldest: HELM_COPY.kinOrderOldest,
  youngest: HELM_COPY.kinOrderYoungest,
  twin: HELM_COPY.kinOrderTwin,
};

const upperFirst = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** "Brother · younger" for a family word and its order. */
export const formatKin = (kin: WhoKin) => {
  const word = KIN_KINDS.find((entry) => entry.kind === kin.kind)?.written;
  return [
    upperFirst(word ?? kin.kind),
    ...(kin.order ? [KIN_ORDER_LABELS[kin.order].toLowerCase()] : []),
  ].join(' · ');
};
