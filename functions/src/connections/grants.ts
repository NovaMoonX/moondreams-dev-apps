import { HttpsError } from 'firebase-functions/v2/https';

import {
  MAX_GRANT_ERRORS,
  type CategoryState,
  type ConnectionGrant,
  type ConnectorId,
  type ConnectorManifest,
  type EndConnectionRequest,
  type GrantCategory,
  type GrantConnectionRequest,
  type GrantStatus,
  type UpdateConnectionRequest,
} from '../vendor/connectionsContract.js';

const MAX_TEXT_LENGTH = 200;
const MAX_CATEGORIES = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_TEXT_LENGTH;

const isGrantId = (value: unknown): value is string =>
  isText(value) && !value.includes('/') && value.split('__').length === 3;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const badRequest = () =>
  new HttpsError('invalid-argument', "That request wasn't understood.");

export function readGrantConnectionRequest(
  data: unknown,
): GrantConnectionRequest {
  if (!isRecord(data)) throw badRequest();
  const { readerAppId, connectorId, accountId, categoryIds } = data;
  if (!isText(readerAppId) || !isText(connectorId) || !isText(accountId))
    throw badRequest();
  if (
    !Array.isArray(categoryIds) ||
    categoryIds.length > MAX_CATEGORIES ||
    !categoryIds.every(isText) ||
    new Set(categoryIds).size !== categoryIds.length
  ) {
    throw badRequest();
  }
  return {
    readerAppId,
    connectorId: connectorId as ConnectorId,
    accountId,
    categoryIds,
  };
}

export function readUpdateConnectionRequest(
  data: unknown,
): UpdateConnectionRequest {
  if (!isRecord(data) || !isGrantId(data.grantId) || !isRecord(data.categories))
    throw badRequest();
  const entries = Object.entries(data.categories);
  if (entries.length === 0 || entries.length > MAX_CATEGORIES)
    throw badRequest();
  if (!entries.every(([id, isOn]) => isText(id) && typeof isOn === 'boolean'))
    throw badRequest();
  return {
    grantId: data.grantId,
    categories: data.categories as Record<string, boolean>,
  };
}

export function readEndConnectionRequest(data: unknown): EndConnectionRequest {
  if (
    !isRecord(data) ||
    !isGrantId(data.grantId) ||
    typeof data.deleteCopies !== 'boolean'
  ) {
    throw badRequest();
  }
  return { grantId: data.grantId, deleteCopies: data.deleteCopies };
}

const isDeclared = (manifest: ConnectorManifest, id: string) =>
  manifest.categories.some((category) => category.id === id);

export function assertDeclaredCategories(
  manifest: ConnectorManifest,
  ids: string[],
) {
  if (!ids.every((id) => isDeclared(manifest, id))) {
    throw new HttpsError('invalid-argument', "This source doesn't share that.");
  }
}

export function buildNewGrant(
  req: GrantConnectionRequest,
  manifest: ConnectorManifest,
  now: number,
): ConnectionGrant {
  return {
    readerAppId: req.readerAppId,
    connectorId: req.connectorId,
    accountId: req.accountId,
    categories: Object.fromEntries(
      manifest.categories.map((category) => [
        category.id,
        { isOn: req.categoryIds.includes(category.id), changedAt: now },
      ]),
    ),
    options: null,
    status: 'live',
    categoryState: Object.fromEntries(
      manifest.categories.map((category) => [
        category.id,
        { lastOkAt: null, lastError: null, count: 0 },
      ]),
    ),
    errors: [],
    newCategoryIds: [],
    lastSyncAt: null,
    syncLeaseUntil: null,
    keptCopies: null,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
  };
}

/** The grant's categories with the changes applied; a switch already in the asked state keeps its time. */
export function applyCategoryChanges(
  grant: ConnectionGrant,
  changes: Record<string, boolean>,
  manifest: ConnectorManifest,
  now: number,
): Record<string, GrantCategory> {
  assertDeclaredCategories(manifest, Object.keys(changes));
  return Object.entries(changes).reduce(
    (categories, [id, isOn]) =>
      categories[id]?.isOn === isOn
        ? categories
        : { ...categories, [id]: { isOn, changedAt: now } },
    grant.categories,
  );
}

const GRANT_STATUSES: GrantStatus[] = [
  'live',
  'needsReconnect',
  'noAccess',
  'ended',
];

const readCategories = (value: unknown): Record<string, GrantCategory> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).map(([id, entry]) => [
          id,
          {
            isOn: isRecord(entry) && entry.isOn === true,
            changedAt:
              isRecord(entry) && isNumber(entry.changedAt)
                ? entry.changedAt
                : 0,
          },
        ]),
      )
    : {};

const readCategoryState = (value: unknown): Record<string, CategoryState> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).map(([id, entry]) => {
          const state = isRecord(entry) ? entry : {};
          const error = isRecord(state.lastError) ? state.lastError : null;
          return [
            id,
            {
              lastOkAt: isNumber(state.lastOkAt) ? state.lastOkAt : null,
              lastError:
                error && typeof error.code === 'string' && isNumber(error.at)
                  ? { code: error.code, at: error.at }
                  : null,
              count: isNumber(state.count) ? state.count : 0,
            },
          ];
        }),
      )
    : {};

const readErrors = (value: unknown): ConnectionGrant['errors'] =>
  Array.isArray(value)
    ? value
        .flatMap((entry) =>
          isRecord(entry) &&
          typeof entry.category === 'string' &&
          typeof entry.code === 'string' &&
          isNumber(entry.at)
            ? [{ category: entry.category, code: entry.code, at: entry.at }]
            : [],
        )
        .slice(0, MAX_GRANT_ERRORS)
    : [];

const readText = (value: unknown) => (typeof value === 'string' ? value : '');
const readTime = (value: unknown) => (isNumber(value) ? value : null);

const readKeptCopies = (value: unknown): ConnectionGrant['keptCopies'] =>
  isRecord(value) && isNumber(value.count)
    ? { count: value.count, deleteAfter: readTime(value.deleteAfter) }
    : null;

const readOptions = (value: unknown): ConnectionGrant['options'] =>
  isRecord(value) && Array.isArray(value.calendarIds)
    ? {
        calendarIds: value.calendarIds.filter(
          (id): id is string => typeof id === 'string',
        ),
      }
    : null;

/** A grant document read with a default for every key it may lack. */
export function readGrant(data: unknown): ConnectionGrant {
  const doc = isRecord(data) ? data : {};
  return {
    readerAppId: readText(doc.readerAppId),
    connectorId: readText(doc.connectorId) as ConnectorId,
    accountId: readText(doc.accountId),
    categories: readCategories(doc.categories),
    options: readOptions(doc.options),
    status: GRANT_STATUSES.find((status) => status === doc.status) ?? 'ended',
    categoryState: readCategoryState(doc.categoryState),
    errors: readErrors(doc.errors),
    newCategoryIds: Array.isArray(doc.newCategoryIds)
      ? doc.newCategoryIds.filter((id): id is string => typeof id === 'string')
      : [],
    lastSyncAt: readTime(doc.lastSyncAt),
    syncLeaseUntil: readTime(doc.syncLeaseUntil),
    keptCopies: readKeptCopies(doc.keptCopies),
    createdAt: isNumber(doc.createdAt) ? doc.createdAt : 0,
    updatedAt: isNumber(doc.updatedAt) ? doc.updatedAt : 0,
    endedAt: readTime(doc.endedAt),
  };
}
