import { useMemo } from 'react';

import { readConnectorAppId } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  countBySource,
  planBringIn,
  toCandidates,
  toCountPhrase,
  type BringInPlan,
} from '@apps/helm/engine/bringIn';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';

export interface BringInOffer {
  grantId: string;
  connectorId: string;
  appId: string;
  appName: string;
  plans: BringInPlan[];
  /** "Nine Lives has 3 pets, a clinic and 2 vets you can bring into your circle." */
  line: string;
}

/** What each connected app holds that the circle doesn't yet: its people, pets and businesses, each sorted as new, the same as someone, or maybe someone. Nothing until the circle and the synced copies have both been read, so a half-loaded circle never offers someone twice. */
export function useBringInOffers(): BringInOffer[] {
  const { grants } = useConnections({ readerAppId: 'helm' });
  const synced = useAppSelector((state) => state.helm.synced);
  const who = useAppSelector((state) => state.helm.who);
  const { nameOf } = useSourceAppName();

  return useMemo(() => {
    if (!synced.isLoaded || !who.isLoaded) return [];
    return grants.flatMap((grant): BringInOffer[] => {
      const appId = readConnectorAppId(grant.connectorId);
      if (appId === null || grant.status !== 'live') return [];
      const plans = planBringIn(
        toCandidates(synced.items, {
          connectorId: grant.connectorId,
          appId,
          isOn: (category) => grant.categories[category]?.isOn === true,
        }),
        who.items,
      );
      if (plans.length === 0) return [];
      const appName = nameOf(grant.connectorId);
      const phrase = toCountPhrase(
        countBySource(plans).map(({ source, count }) => ({
          count,
          ...source.noun,
        })),
      );
      return [
        {
          grantId: grant.id,
          connectorId: grant.connectorId,
          appId,
          appName,
          plans,
          line: HELM_COPY.bringInOfferLine(appName, phrase),
        },
      ];
    });
    // nameOf is rebuilt every render and only reads the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grants, synced, who]);
}
