import {
  readConnectorAppId,
  type ConnectorManifest,
  type SourceShares,
} from '@/lib/connections/contract';
import { GOOGLE_CALENDAR_MANIFEST } from '@/lib/connections/google/calendarManifest';
import { GOOGLE_CONTACTS_MANIFEST } from '@/lib/connections/google/contactsManifest';
import { GOOGLE_DRIVE_MANIFEST } from '@/lib/connections/google/driveManifest';
import { GOOGLE_GMAIL_MANIFEST } from '@/lib/connections/google/gmailManifest';
import { A_LIST_SHARES } from '@apps/a-list/share/manifest';
import { GOING_ONCE_SHARES } from '@apps/going-once/share/manifest';
import { HELM_SHARES } from '@apps/helm/share/manifest';
import { NINE_LIVES_SHARES } from '@apps/nine-lives/share/manifest';
import { PINCH_SHARES } from '@apps/pinch/share/manifest';
import { WAYPOINT_SHARES } from '@apps/waypoint/share/manifest';
import { WORTH_THE_WAIT_SHARES } from '@apps/worth-the-wait/share/manifest';

/** Every site app's sharing declaration; an app is added here when it declares what it offers. */
export const SOURCE_SHARES: SourceShares[] = [
  PINCH_SHARES,
  A_LIST_SHARES,
  GOING_ONCE_SHARES,
  NINE_LIVES_SHARES,
  WAYPOINT_SHARES,
  WORTH_THE_WAIT_SHARES,
  HELM_SHARES,
];

/** The manifest an app offers, or null when it offers nothing. */
export const getSourceManifest = (appId: string) =>
  SOURCE_SHARES.find((source) => source.appId === appId)?.shares[0] ?? null;

/** The manifest of any connector, a site app's or an outside service's, or null when it offers nothing. */
export const getConnectorManifest = (
  connectorId: string,
): ConnectorManifest | null =>
  [
    GOOGLE_CALENDAR_MANIFEST,
    GOOGLE_GMAIL_MANIFEST,
    GOOGLE_DRIVE_MANIFEST,
    GOOGLE_CONTACTS_MANIFEST,
  ].find((manifest) => manifest.id === connectorId) ??
  getSourceManifest(readConnectorAppId(connectorId) ?? '');
