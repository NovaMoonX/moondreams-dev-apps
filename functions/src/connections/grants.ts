import { HttpsError } from 'firebase-functions/v2/https';

import {
  MAX_ACCOUNT_LABEL_LENGTH,
  MAX_GRANT_ERRORS,
  type CategoryState,
  type ConnectionGrant,
  type ConnectorId,
  type ConnectorManifest,
  type EndConnectionRequest,
  type GrantCategory,
  type GrantConnectionRequest,
  type GrantOptions,
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
  isText(value) &&
  !value.includes('/') &&
  value.split('__').length === 3 &&
  value.split('__').every((part) => part.length > 0);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const badRequest = () =>
  new HttpsError('invalid-argument', "That request wasn't understood.");

/** Null or one to fifty non-empty ids; anything else is a bad request. */
const readOptionsInput = (value: unknown): GrantOptions | null => {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) ||
    !Array.isArray(value.calendarIds) ||
    value.calendarIds.length === 0 ||
    value.calendarIds.length > MAX_CATEGORIES ||
    !value.calendarIds.every(isText)
  ) {
    throw badRequest();
  }
  return { calendarIds: value.calendarIds as string[] };
};

/** Trimmed; empty reads as no label. */
const readAccountLabelInput = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest();
  const label = value.trim();
  if (label.length > MAX_ACCOUNT_LABEL_LENGTH) throw badRequest();
  return label.length === 0 ? null : label;
};

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
    options: readOptionsInput(data.options),
  };
}

const requireOptions = (value: unknown): GrantOptions => {
  const options = readOptionsInput(value);
  if (!options) throw badRequest();
  return options;
};

const readCategoryChanges = (value: unknown): Record<string, boolean> => {
  if (!isRecord(value)) throw badRequest();
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_CATEGORIES)
    throw badRequest();
  if (!entries.every(([id, isOn]) => isText(id) && typeof isOn === 'boolean'))
    throw badRequest();
  return value as Record<string, boolean>;
};

const readSeenScopes = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) throw badRequest();
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_CATEGORIES)
    throw badRequest();
  if (
    !entries.every(
      ([id, version]) =>
        isText(id) && Number.isInteger(version) && (version as number) >= 1,
    )
  )
    throw badRequest();
  return value as Record<string, number>;
};

export function readUpdateConnectionRequest(
  data: unknown,
): UpdateConnectionRequest {
  if (!isRecord(data) || !isGrantId(data.grantId)) throw badRequest();
  const hasCategories = data.categories !== undefined;
  const hasOptions = data.options !== undefined;
  const hasLabel = data.accountLabel !== undefined;
  const hasSeen = data.seenScopes !== undefined;
  if (!hasCategories && !hasOptions && !hasLabel && !hasSeen)
    throw badRequest();
  return {
    grantId: data.grantId,
    ...(hasCategories
      ? { categories: readCategoryChanges(data.categories) }
      : {}),
    ...(hasOptions ? { options: requireOptions(data.options) } : {}),
    ...(hasLabel
      ? { accountLabel: readAccountLabelInput(data.accountLabel) }
      : {}),
    ...(hasSeen ? { seenScopes: readSeenScopes(data.seenScopes) } : {}),
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

export function readSyncRequest(data: unknown): { grantId: string | null } {
  if (data === undefined || data === null) return { grantId: null };
  if (!isRecord(data)) throw badRequest();
  if (data.grantId === undefined || data.grantId === null)
    return { grantId: null };
  if (!isGrantId(data.grantId)) throw badRequest();
  return { grantId: data.grantId };
}

export function readDeleteKeptRequest(data: unknown): { grantId: string } {
  if (!isRecord(data) || !isGrantId(data.grantId)) throw badRequest();
  return { grantId: data.grantId };
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

/** The scopes an outside connector asks for the given categories (all of them when none are named). */
export function requestedScopes(
  manifest: ConnectorManifest,
  categoryIds?: string[],
): string[] {
  if (manifest.connect.kind !== 'oauth') return [];
  const { scopesByCategory } = manifest.connect;
  return Array.from(
    new Set(
      Object.entries(scopesByCategory)
        .filter(([id]) => !categoryIds || categoryIds.includes(id))
        .flatMap(([, scopes]) => scopes),
    ),
  );
}

export function buildNewGrant(
  req: GrantConnectionRequest,
  manifest: ConnectorManifest,
  now: number,
  keptCopies: ConnectionGrant['keptCopies'] = null,
): ConnectionGrant {
  return {
    readerAppId: req.readerAppId,
    connectorId: req.connectorId,
    accountId: req.accountId,
    categories: Object.fromEntries(
      manifest.categories.map((category) => [
        category.id,
        {
          isOn: req.categoryIds.includes(category.id),
          changedAt: now,
          seenScopeVersion: category.scopeVersion,
        },
      ]),
    ),
    options: req.options,
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
    keptCopies,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
  };
}

/** The grant's categories with the changes applied; a switch already in the asked state keeps its time, and a switch changed or a scope seen records the category's current scope as seen. */
export function applyCategoryChanges(
  grant: ConnectionGrant,
  changes: Record<string, boolean>,
  manifest: ConnectorManifest,
  now: number,
  seenScopes: Record<string, number> = {},
): Record<string, GrantCategory> {
  assertDeclaredCategories(manifest, Object.keys(changes));
  assertSeenScopes(manifest, seenScopes);
  const scopeOf = (id: string) =>
    manifest.categories.find((category) => category.id === id)?.scopeVersion ??
    1;
  const switched = Object.entries(changes).reduce(
    (categories, [id, isOn]) =>
      categories[id]?.isOn === isOn
        ? categories
        : {
            ...categories,
            [id]: { isOn, changedAt: now, seenScopeVersion: scopeOf(id) },
          },
    grant.categories,
  );
  return Object.entries(seenScopes).reduce(
    (categories, [id, version]) =>
      categories[id]
        ? {
            ...categories,
            [id]: {
              ...categories[id],
              seenScopeVersion: Math.max(
                version,
                categories[id].seenScopeVersion ?? 1,
              ),
            },
          }
        : categories,
    switched,
  );
}

/** A seen scope names a declared category and no version past the manifest's. */
export function assertSeenScopes(
  manifest: ConnectorManifest,
  seenScopes: Record<string, number>,
) {
  const isValid = Object.entries(seenScopes).every(([id, version]) =>
    manifest.categories.some(
      (category) =>
        category.id === id &&
        Number.isInteger(version) &&
        version >= 1 &&
        version <= category.scopeVersion,
    ),
  );
  if (!isValid) throw badRequest();
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
            seenScopeVersion:
              isRecord(entry) && isNumber(entry.seenScopeVersion)
                ? entry.seenScopeVersion
                : null,
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
